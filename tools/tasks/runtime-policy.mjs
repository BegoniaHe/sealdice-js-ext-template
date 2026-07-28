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

export function runtimePolicyViolations(source, allowedGlobals = []) {
  const allowed = new Set(allowedGlobals);
  const file = ts.createSourceFile(
    'bundle.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const bindings = collectBindings(file);
  const violations = new Set();
  const record = (name, allowException = true) => {
    if (!allowException || !allowed.has(name)) violations.add(name);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const moduleName = stringLiteralValue(node.moduleSpecifier);
      if (moduleName?.startsWith('node:')) record(moduleName, false);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      const moduleName = stringLiteralValue(node.arguments[0]);
      if (moduleName?.startsWith('node:')) record(moduleName, false);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const moduleName = stringLiteralValue(node.arguments[0]);
      if (moduleName?.startsWith('node:')) record(moduleName, false);
    }
    if (
      ts.isIdentifier(node) &&
      unsupportedGlobals.has(node.text) &&
      !bindings.has(node.text) &&
      isReferenceIdentifier(node)
    ) {
      record(node.text);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      globalObjectNames.has(node.expression.text) &&
      unsupportedGlobals.has(node.name.text)
    ) {
      record(node.name.text);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      globalObjectNames.has(node.expression.text)
    ) {
      const property = stringLiteralValue(node.argumentExpression);
      if (property && unsupportedGlobals.has(property)) record(property);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...violations].sort();
}

export async function assertRuntimePolicy(bundlePath, config) {
  const source = await fs.readFile(bundlePath, 'utf8');
  const violations = runtimePolicyViolations(
    source,
    config.runtime.allowedGlobals,
  );
  if (violations.length) {
    throw new CliError(
      `Bundle references globals unavailable by default in the SealDice goja runtime: ${violations.join(', ')}. Add a reviewed runtime.allowedGlobals exception only after core-backed runtime verification.`,
      4,
    );
  }
}
