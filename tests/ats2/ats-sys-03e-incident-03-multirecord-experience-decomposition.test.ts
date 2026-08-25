import test from 'node:test';
import assert from 'node:assert/strict';

import {
  splitSourceExactExperienceSegments,
} from '../../lib/infrastructure/import/OllamaResumeImportV3Provider';

test('ATS-SYS-03E INC-03 partitions a large experience section by strong source anchors without assuming one anchor equals one record', () => {
  const source = [
    'EXPERIENCE',
    'Alpha Systems — Platform Engineer Jan. 2020 - Dec. 2020',
    'Built platform services.',
    'Bravo Labs — Backend Engineer Jan. 2021 - Dec. 2021',
    'Built backend services.',
    'Charlie Works — Software Engineer Jan. 2022 - Dec. 2022',
    'Initial responsibilities.',
    // A second source-backed career state can exist inside this bounded
    // segment without a second strong identity/date anchor.
    'Promoted internally to Reliability Lead',
    '2022 - 2023',
    'Expanded operational responsibilities.',
    'Delta Group — Systems Engineer Jan. 2023 - Dec. 2023',
    'Worked on systems.',
    'Echo Industries — Technical Lead Jan. 2024 - Present',
    'Led delivery.',
  ].join('\n');

  const segments =
    splitSourceExactExperienceSegments(source);

  assert.equal(segments.length, 5);

  assert.match(
    segments[2],
    /Promoted internally to Reliability Lead/,
  );

  assert.match(
    segments[2],
    /2022 - 2023/,
  );
});

test('ATS-SYS-03E INC-03 does not mistake a bare date range for a new experience anchor', () => {
  const source = [
    'EXPERIENCE',
    'Northstar Systems — Engineer Jan. 2021 - Dec. 2021',
    'Worked on services.',
    '2021 – 2022',
    'Additional source material.',
    'Southstar Systems — Engineer Jan. 2023 - Present',
    'Worked on infrastructure.',
  ].join('\n');

  const segments =
    splitSourceExactExperienceSegments(source);

  assert.equal(segments.length, 2);
  assert.match(segments[0], /2021 – 2022/);
});

test('ATS-SYS-03E INC-03 preserves every original experience body line exactly once across bounded segments', () => {
  const source = [
    'EXPERIENCE',
    'Atlas Labs — Engineer Jan. 2020 - Dec. 2020',
    'Line A.',
    'Beacon Labs — Engineer Jan. 2021 - Dec. 2021',
    'Line B.',
    '2021 - 2022',
    'Line C.',
    'Cedar Labs — Engineer Jan. 2023 - Present',
    'Line D.',
  ].join('\n');

  const originalBody = source
    .split('\\n')
    .slice(1);

  const reconstructedBody =
    splitSourceExactExperienceSegments(source)
      .flatMap((segment) =>
        segment.split('\\n').slice(1)
      );

  assert.deepEqual(
    reconstructedBody,
    originalBody,
  );
});
