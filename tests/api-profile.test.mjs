import assert from 'node:assert/strict';
import test from 'node:test';

import {
  makeCompatibilityProfile,
  validateProfileProvenance,
} from '../tools/api/profile.mjs';

const first = {
  core: { commit: 'first', sourceFingerprint: 'sha256:first' },
  entries: [{ kind: 'function', path: 'seal.old' }],
  profileVersion: 1,
  sealDiceVersion: '1.5.0',
  typeDeclarationSource: 'types/seal.d.ts',
  types: {},
};

test('compatibility profile makes members absent from any host optional', () => {
  const profile = makeCompatibilityProfile(
    [
      first,
      {
        ...first,
        core: { commit: 'second', sourceFingerprint: 'sha256:second' },
        entries: [...first.entries, { kind: 'function', path: 'seal.new' }],
        sealDiceVersion: '1.5.1',
      },
    ],
    { id: 'compat-1.5.x' },
  );
  assert.equal(
    profile.entries.find((entry) => entry.path === 'seal.new').optional,
    true,
  );
});

test('compatibility profile rejects silent signature changes', () => {
  assert.throws(() =>
    makeCompatibilityProfile(
      [
        first,
        {
          ...first,
          entries: [{ arity: 1, kind: 'function', path: 'seal.old' }],
          sealDiceVersion: '1.5.1',
        },
      ],
      { id: 'compat-1.5.x' },
    ),
  );
});

test('compatibility profiles support more than two exact hosts', () => {
  const profile = makeCompatibilityProfile(
    [
      first,
      {
        ...first,
        core: { commit: 'second', sourceFingerprint: 'sha256:second' },
        sealDiceVersion: '1.5.1',
      },
      {
        ...first,
        core: { commit: 'third', sourceFingerprint: 'sha256:third' },
        entries: [...first.entries, { kind: 'function', path: 'seal.new' }],
        sealDiceVersion: '1.5.2',
      },
    ],
    { id: 'compat-1.5.x' },
  );
  assert.deepEqual(profile.compatibility.members, ['1.5.0', '1.5.1', '1.5.2']);
  assert.equal(
    profile.entries.find((entry) => entry.path === 'seal.new').optional,
    true,
  );
});

test('release/source version mismatch requires explicit acknowledgement', () => {
  const profile = {
    core: { commit: 'core-commit', sourceFingerprint: 'sha256:source' },
    profileVersion: 1,
    provenance: {
      artifact: {
        name: 'seal.tar.gz',
        sha256: `sha256:${'a'.repeat(64)}`,
        url: 'https://example.invalid/seal.tar.gz',
      },
      release: {
        commit: 'build-commit',
        publishedAt: '2026-07-26T16:07:20Z',
        repository: 'https://github.com/sealdice/sealdice-build',
        tag: 'v1.6.0',
      },
      runtime: { observedVersion: '1.6.0+20260726', platform: 'linux-amd64' },
      source: {
        commit: 'core-commit',
        declaredVersion: '1.5.1-dev',
        repository: 'https://github.com/sealdice/sealdice-core',
      },
    },
    sealDiceVersion: '1.6.0',
  };

  assert.throws(() => validateProfileProvenance(profile), /acknowledgement/);
  profile.provenance.versionMismatch = {
    reason: 'The distribution release injects the final version at build time.',
    status: 'acknowledged',
  };
  assert.doesNotThrow(() => validateProfileProvenance(profile));
});
