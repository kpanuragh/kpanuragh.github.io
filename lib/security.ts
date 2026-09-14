/**
 * Single source of truth for security findings credited to Anuragh KP.
 *
 * A `SecurityFinding` is a discriminated union on `cve`. Most fields differ
 * between the two branches on purpose: a finding that never received a CVE
 * doesn't have a severity, a CVSS vector, or a "patched version" in the sense
 * an advisory database would recognize — inventing placeholder values for
 * those fields would itself be a fabricated claim. Because `cve` is typed as
 * `string | null` rather than `string | undefined`, TypeScript forces every
 * reader to handle the `null` branch explicitly (an optional field could be
 * silently skipped); nothing may assume every finding carries a CVE.
 *
 * Do not add a finding to this file, or edit the CVE/GHSA identifiers of an
 * existing one, without the same level of external verification the two
 * findings here already have. See `CLAUDE.md` → "Facts and claim discipline".
 */

type FindingBase = {
  /** Stable slug, used as a React key / anchor and in tests. */
  id: string;
  packageName: string;
  packageEcosystem: 'npm' | 'composer';
  title: string;
  /** Plain-language technical summary of the vulnerability. */
  summary: string;
  /** His role in the finding — always true, never inflated to "co-author" etc. */
  role: string;
};

/** A finding that received a published CVE. */
export type CveAssignedFinding = FindingBase & {
  cve: string;
  ghsaId: string;
  ghsaUrl: string;
  /** YYYY-MM-DD */
  published: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cvssVector: string;
  affectedVersions: string;
  patchedVersion: string;
};

/**
 * A finding where the advisory process ran to completion but no CVE was ever
 * assigned. `cve` is `null` here — always check it before rendering a CVE
 * badge or identifier for this finding.
 */
export type NoCveFinding = FindingBase & {
  cve: null;
  ghsaId: string;
  ghsaStatus: 'closed_unpublished';
  commit: string;
  shippedIn: string;
  grammarsAffected: string[];
  /** Why the maintainers declined to issue a CVE. */
  declinedRationale: string;
  /** Why the patch shipped anyway, despite that rationale being reasonable. */
  defenseInDepthNote: string;
};

export type SecurityFinding = CveAssignedFinding | NoCveFinding;

export const securityFindings: SecurityFinding[] = [
  {
    id: 'langchain-recursiveurlloader-ssrf',
    packageName: '@langchain/community',
    packageEcosystem: 'npm',
    title: 'SSRF bypass in RecursiveUrlLoader via insufficient URL origin validation',
    summary:
      "RecursiveUrlLoader's preventOutside option used String.startsWith() to decide whether a " +
      'discovered link was same-site, so a page under https://example.com.attacker.com passed a ' +
      'check written against https://example.com. There was also no filtering of private or ' +
      'reserved IP ranges, so a crawled page could redirect the loader at cloud metadata endpoints ' +
      'such as 169.254.169.254, at localhost, or at RFC 1918 addresses — potentially exposing IAM ' +
      'credentials. The fix replaced the prefix comparison with a strict new URL(x).origin ' +
      'comparison and added an SSRF validation module applied before every outbound fetch.',
    role: 'reporter',
    cve: 'CVE-2026-26019',
    ghsaId: 'GHSA-gf3v-fwqg-4vh7',
    ghsaUrl: 'https://github.com/advisories/GHSA-gf3v-fwqg-4vh7',
    published: '2026-02-11',
    severity: 'medium',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:N/A:N',
    affectedVersions: '<= 1.1.13',
    patchedVersion: '1.1.14',
  },
  {
    id: 'laravel-query-builder-index-hint-injection',
    packageName: 'laravel/framework',
    packageEcosystem: 'composer',
    title: 'An injection vector in query-builder index hints',
    summary:
      'forceIndex() and inRandomOrder() passed their argument into the compiled SQL without ' +
      'validation, across the MySQL, SQLite and SQL Server grammars.',
    role: 'reported and patched',
    cve: null,
    ghsaId: 'GHSA-9p82-4j4w-5hw8',
    ghsaStatus: 'closed_unpublished',
    commit: '1dcf0b38',
    shippedIn: 'v12.48.0',
    grammarsAffected: ['MySqlGrammar.php', 'SQLiteGrammar.php', 'SqlServerGrammar.php'],
    declinedRationale:
      "The maintainers' position was that not passing user input into an index hint is the " +
      "developer's responsibility — the same contract as DB::raw(). They aren't wrong: nothing " +
      'in the docs ever suggested those arguments were escaped.',
    defenseInDepthNote:
      'The patch shipped anyway, which is the right outcome. A framework can hold a documented ' +
      'contract and still refuse to compile a string that could never be a valid index name. ' +
      "That's defence in depth, and it costs one preg_match.",
  },
];
