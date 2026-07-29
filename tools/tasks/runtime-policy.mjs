import fs from 'node:fs/promises';

import ts from 'typescript';

import { CliError } from '../cli/lib/errors.mjs';

const unsupportedGlobals = new Set([
  'AbortController',
  'Blob',
  'Buffer',
  'File',
  'FormData',
  'Headers',
  'ReadableStream',
  'Request',
  'Response',
  'TextDecoder',
  'TextEncoder',
  'TransformStream',
  'URL',
  'WritableStream',
  'crypto',
  'process',
]);

const globalObjectNames = new Set(['global', 'globalThis', 'window']);

function collectBindings(source) {
  const bindings = new Set();
  const addBinding = (name) => {
    if (ts.isIdentifier(name)) bindings.add(name.text);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) addBinding(element.name);
      }
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)) addBinding(node.name);
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name
    ) {
      bindings.add(node.name.text);
    }
    if (ts.isParameter(node)) addBinding(node.name);
    if (ts.isImportClause(node)) {
      if (node.name) bindings.add(node.name.text);
      if (node.namedBindings && ts.isNamespaceImport(node.namedBindings))
        bindings.add(node.namedBindings.name.text);
      if (node.namedBindings && ts.isNamedImports(node.namedBindings))
        for (const element of node.namedBindings.elements)
          bindings.add(element.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return bindings;
}

function isReferenceIdentifier(node) {
  const parent = node.parent;
  if (!parent) return true;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node) ||
    (ts.isFunctionDeclaration(parent) && parent.name === node) ||
    (ts.isClassDeclaration(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.name === node)
  ) {
    return false;
  }
  return true;
}

function stringLiteralValue(node) {
  return node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function runtimePolicyViolationDetails(source, allowedGlobals = []) {
  const allowed = new Set(allowedGlobals);
  const file = ts.createSourceFile(
    'runtime-policy.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bindings = collectBindings(file);
  const violations = new Map();
  const record = (name, node, allowException = true) => {
    if (allowException && allowed.has(name)) return;
    if (violations.has(name)) return;
    const position = file.getLineAndCharacterOfPosition(node.getStart(file));
    violations.set(name, {
      column: position.character + 1,
      line: position.line + 1,
      name,
    });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const moduleName = stringLiteralValue(node.moduleSpecifier);
      if (moduleName?.startsWith('node:')) record(moduleName, node, false);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      const moduleName = stringLiteralValue(node.arguments[0]);
      if (moduleName?.startsWith('node:')) record(moduleName, node, false);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const moduleName = stringLiteralValue(node.arguments[0]);
      if (moduleName?.startsWith('node:')) record(moduleName, node, false);
    }
    if (
      ts.isIdentifier(node) &&
      unsupportedGlobals.has(node.text) &&
      !bindings.has(node.text) &&
      isReferenceIdentifier(node)
    ) {
      record(node.text, node);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      globalObjectNames.has(node.expression.text) &&
      unsupportedGlobals.has(node.name.text)
    ) {
      record(node.name.text, node.name);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      globalObjectNames.has(node.expression.text)
    ) {
      const property = stringLiteralValue(node.argumentExpression);
      if (property && unsupportedGlobals.has(property)) record(property, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...violations.values()].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

export function runtimePolicyViolations(source, allowedGlobals = []) {
  return runtimePolicyViolationDetails(source, allowedGlobals).map(
    ({ name }) => name,
  );
}

export function runtimePolicyLocations(source, allowedGlobals = []) {
  return runtimePolicyViolationDetails(source, allowedGlobals);
}

function remediationFor(name) {
  if (name.startsWith('node:'))
    return 'replace the Node built-in with a browser-compatible dependency';
  if (name === 'process' || name === 'Buffer')
    return 'remove the Node global from plugin runtime code';
  return `avoid ${name} or add it to runtime.allowedGlobals only after real-runtime review`;
}

function sourceLocation(detail) {
  if (!detail.source) return `bundle.js:${detail.line}:${detail.column}`;
  return `${detail.source}:${detail.line}:${detail.column}`;
}

function runtimePolicyMessage(details) {
  const locations = details
    .map((detail) => `${detail.name} at ${sourceLocation(detail)}`)
    .join(', ');
  const remedies = details
    .map((detail) => `${detail.name}: ${remediationFor(detail.name)}`)
    .join('; ');
  return `[runtime:static-policy] SealDice goja does not provide ${details
    .map(({ name }) => name)
    .join(', ')}. Detected ${locations}. Suggested fix: ${remedies}.`;
}

export async function assertRuntimePolicy(
  bundlePath,
  config,
  { sourceFiles = [] } = {},
) {
  const source = await fs.readFile(bundlePath, 'utf8');
  const violations = runtimePolicyLocations(
    source,
    config.runtime.allowedGlobals,
  );
  if (violations.length) {
    const locationsByName = new Map();
    for (const sourceFile of sourceFiles) {
      const sourceText = await fs.readFile(sourceFile.path, 'utf8');
      for (const detail of runtimePolicyLocations(
        sourceText,
        config.runtime.allowedGlobals,
      )) {
        if (!locationsByName.has(detail.name))
          locationsByName.set(detail.name, {
            ...detail,
            source: sourceFile.name,
          });
      }
    }
    const detailedViolations = violations.map(
      (detail) => locationsByName.get(detail.name) ?? detail,
    );
    throw new CliError(runtimePolicyMessage(detailedViolations), 4);
  }
}
