import { sha256, stableJson } from '../cli/lib/files.mjs';

export function profileHash(profile) {
  return `sha256:${sha256(stableJson(profile))}`;
}

export function entryMap(profile) {
  return new Map(profile.entries.map((entry) => [entry.path, entry]));
}

export function comparableEntry(entry) {
  return {
    arity: entry.arity ?? 0,
    factoryReturn: entry.factoryReturn ?? '',
    goSignature: entry.goSignature ?? '',
    kind: entry.kind,
    path: entry.path,
  };
}

export function equalEntries(left, right) {
  return (
    stableJson(comparableEntry(left)) === stableJson(comparableEntry(right))
  );
}

function assertProvenance(condition, message) {
  if (!condition) throw new Error(`Invalid release provenance: ${message}`);
}

/**
 * Exact profiles can optionally record the released distribution separately
 * from the core commit scanned for their API. This is required when a build
 * repository injects a release version that differs from version.go.
 */
export function validateProfileProvenance(profile) {
  const provenance = profile.provenance;
  if (!provenance) return;

  const { artifact, release, runtime, source, versionMismatch } = provenance;
  assertProvenance(
    release && typeof release === 'object',
    'release is required',
  );
  assertProvenance(
    release.tag === `v${profile.sealDiceVersion}`,
    `release tag must be v${profile.sealDiceVersion}`,
  );
  assertProvenance(
    typeof release.repository === 'string' &&
      typeof release.commit === 'string' &&
      typeof release.publishedAt === 'string',
    'release repository, commit and publishedAt are required',
  );
  assertProvenance(source && typeof source === 'object', 'source is required');
  assertProvenance(
    source.commit === profile.core.commit,
    'source commit must equal profile core commit',
  );
  assertProvenance(
    typeof source.repository === 'string' &&
      typeof source.declaredVersion === 'string',
    'source repository and declaredVersion are required',
  );
  assertProvenance(
    artifact && typeof artifact === 'object',
    'artifact is required',
  );
  assertProvenance(
    typeof artifact.name === 'string' &&
      typeof artifact.url === 'string' &&
      /^sha256:[0-9a-f]{64}$/.test(artifact.sha256 ?? ''),
    'artifact name, URL and sha256 digest are required',
  );
  assertProvenance(
    runtime && typeof runtime === 'object',
    'runtime is required',
  );
  assertProvenance(
    typeof runtime.platform === 'string' &&
      typeof runtime.observedVersion === 'string' &&
      runtime.observedVersion.startsWith(profile.sealDiceVersion),
    'runtime platform and matching observedVersion are required',
  );
  if (source.declaredVersion !== profile.sealDiceVersion) {
    assertProvenance(
      versionMismatch?.status === 'acknowledged' &&
        typeof versionMismatch.reason === 'string' &&
        versionMismatch.reason.length > 0,
      'source/release version mismatch requires an acknowledgement',
    );
  }
}

export function makeCompatibilityProfile(profiles, options = {}) {
  if (!Array.isArray(profiles) || profiles.length < 2)
    throw new Error(
      'A compatibility profile requires at least two exact profiles',
    );
  if (!options.id) throw new Error('A compatibility profile requires an id');
  const entriesByProfile = profiles.map(entryMap);
  const paths = new Set(
    entriesByProfile.flatMap((entries) => [...entries.keys()]),
  );
  const entries = [];
  const allowed = new Set(options.allowIncompatiblePaths ?? []);
  for (const memberPath of [...paths].sort()) {
    const candidates = entriesByProfile
      .map((entries) => entries.get(memberPath))
      .filter(Boolean);
    const [first] = candidates;
    if (!first) continue;
    if (
      candidates.some((candidate) => !equalEntries(first, candidate)) &&
      !allowed.has(memberPath)
    ) {
      throw new Error(
        `Incompatible API entry ${memberPath}; add an explicit compat override before generating a single bundle`,
      );
    }
    entries.push({
      ...first,
      ...(candidates.length === profiles.length ? {} : { optional: true }),
    });
  }
  const typeDeclarationSource = profiles[0].typeDeclarationSource;
  if (
    profiles.some(
      (profile) => profile.typeDeclarationSource !== typeDeclarationSource,
    )
  )
    throw new Error(
      'Compatibility profiles must use the same declaration source',
    );
  return {
    compatibility: {
      members: profiles.map((profile) => profile.sealDiceVersion),
      mode: 'intersection-with-optional-additions',
    },
    core: {
      commits: profiles.map((profile) => profile.core.commit),
      sourceFingerprints: profiles.map(
        (profile) => profile.core.sourceFingerprint,
      ),
    },
    entries,
    profileVersion: 1,
    sealDiceVersion: options.id,
    typeDeclarationSource,
    types: profiles[0].types,
  };
}

export function renderDeclaration(source, profile) {
  const generatedHeader = `/**\n * SealDice JavaScript plugin API for SealDice ${profile.sealDiceVersion}.\n *\n * Generated from api/profiles/${profile.sealDiceVersion}.json. The TypeScript\n * semantic mapping is maintained by the checked-in profile override.\n */`;
  const configGroups = profile.typeDeclarationOptions?.configGroups === true;
  const declaration = source
    .replace(/^\/\*\*[\s\S]*?\*\/\n/, `${generatedHeader}\n`)
    .replaceAll(
      '    /* __SEAL_CONFIG_ITEM_GROUP__ */\n',
      configGroups ? '    group: string;\n' : '',
    )
    .replaceAll(
      '      /* __SEAL_CONFIG_GROUP_PARAMETER__ */\n',
      configGroups ? '      group?: string,\n' : '',
    );
  if (declaration.includes('__SEAL_')) {
    throw new Error('Unknown TypeScript declaration template marker');
  }
  return declaration;
}

export function renderReport(profile) {
  const rows = profile.entries
    .map((entry) => {
      const signature = entry.goSignature
        ? '`' + entry.goSignature + '`'
        : entry.kind;
      const optional = entry.optional ? ' optional' : '';
      return ['`' + entry.path + '`', entry.kind + optional, signature];
    })
    .sort((left, right) => left[0].localeCompare(right[0]));
  const header = ['Path', 'Kind', 'Go signature'];
  const widths = header.map((value, index) =>
    Math.max(value.length, ...rows.map((row) => row[index].length)),
  );
  const tableRow = (row) =>
    `| ${row.map((value, index) => value.padEnd(widths[index])).join(' | ')} |`;
  const table = [
    tableRow(header),
    tableRow(widths.map((width) => '-'.repeat(width))),
    ...rows.map(tableRow),
  ].join('\n');
  const commit = Array.isArray(profile.core.commits)
    ? profile.core.commits.join(', ')
    : profile.core.commit;
  const fingerprint = Array.isArray(profile.core.sourceFingerprints)
    ? profile.core.sourceFingerprints.join(', ')
    : profile.core.sourceFingerprint;
  const provenance = profile.provenance;
  const provenanceSection = provenance
    ? [
        '## Release Provenance',
        '',
        `- Distribution: [\`${provenance.release.tag}\`](${provenance.release.repository}/releases/tag/${provenance.release.tag}) at \`${provenance.release.commit}\``,
        `- Source: [\`${provenance.source.commit}\`](${provenance.source.repository}/commit/${provenance.source.commit})`,
        `- Artifact: [\`${provenance.artifact.name}\`](${provenance.artifact.url}) with \`${provenance.artifact.sha256}\``,
        `- Observed runtime: \`${provenance.runtime.observedVersion}\` on \`${provenance.runtime.platform}\``,
        ...(provenance.versionMismatch
          ? [
              `- Source/release mismatch: \`${provenance.source.declaredVersion}\` acknowledged: ${provenance.versionMismatch.reason}`,
            ]
          : []),
      ].join('\n')
    : '';
  const spacing = provenanceSection ? `\n\n${provenanceSection}` : '';
  return `# SealDice ${profile.sealDiceVersion} API Profile\n\n- Profile hash: \`${profileHash(profile)}\`\n- Core commit: \`${commit}\`\n- Source fingerprint: \`${fingerprint}\`${spacing}\n\n${table}\n`;
}
