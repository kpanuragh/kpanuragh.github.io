export type Role = {
  org: string;
  title: string;
  /** YYYY-MM */
  start: string;
  /** YYYY-MM, or null if current */
  end: string | null;
  location?: string;
  note?: string;
};

export type Certification = {
  name: string;
  issuer: string;
  /** YYYY-MM */
  issued: string;
  /** YYYY-MM */
  expires?: string;
  credentialId?: string;
  lapsed: boolean;
};

/** First paid role, used to compute years of experience. */
export const CAREER_START = '2017-05';

export const roles: Role[] = [
  {
    org: 'Kerala Police Cyberdome',
    title: 'Hon. Elite Member',
    start: '2022-12',
    end: null,
    location: 'Trivandrum, Kerala',
    note: 'Volunteer. Darknet monitoring for child-safety threats on the Graphnel Project, and an AI-driven platform for detecting fraudulent activity. Angular, Python, Node.js, Elasticsearch.',
  },
  {
    org: 'Cubet Techno Labs',
    title: 'Technical Lead',
    start: '2021-01',
    end: null,
    location: 'Kochi, Kerala',
    note: 'Serverless commerce backends on AWS — Lambda, DynamoDB, SQS, SES, Elasticsearch. Migrated a Learning Management System from Slim 3 to Slim 4 and PHP 8.2.',
  },
  {
    org: 'Bramma IT Solutions',
    title: 'Technical Lead',
    start: '2019-05',
    end: '2020-06',
    location: 'Kochi, Kerala',
  },
  {
    org: 'Acodez IT Solutions',
    title: 'Node.js Developer',
    start: '2018-01',
    end: '2019-05',
    location: 'Calicut, Kerala',
  },
  {
    org: 'Sparrow Solution',
    title: 'PHP Developer',
    start: '2017-09',
    end: '2017-12',
    location: 'Kozhikode, Kerala',
  },
  {
    org: 'Tekubez',
    title: 'Developer',
    start: '2017-05',
    end: '2017-08',
    location: 'Kozhikode, Kerala',
  },
];

export const certifications: Certification[] = [
  {
    name: 'LFEL1006: Securing Projects with OpenSSF Scorecard',
    issuer: 'The Linux Foundation',
    issued: '2026-06',
    lapsed: false,
  },
  {
    name: "LFD103: A Beginner's Guide to Linux Kernel Development",
    issuer: 'The Linux Foundation',
    issued: '2024-04',
    lapsed: false,
  },
  {
    name: 'LFEL1002: Getting Started with Rust',
    issuer: 'The Linux Foundation',
    issued: '2024-03',
    lapsed: false,
  },
  {
    name: 'Certified Ethical Hacker (CEH)',
    issuer: 'EC-Council',
    issued: '2021-09',
    expires: '2024-09',
    credentialId: 'ECC5162079483',
    lapsed: true,
  },
];

export function yearsWorking(asOf: Date = new Date()): number {
  const [y, m] = CAREER_START.split('-').map(Number);
  const months = (asOf.getFullYear() - y) * 12 + (asOf.getMonth() + 1 - m);
  return Math.floor(months / 12);
}
