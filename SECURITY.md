# Security policy

## Supported versions

Opsorama is pre-release. Security fixes are made on `main` and in the latest published `0.x` version once packages are published.

## Reporting a vulnerability

Please do **not** open a public issue. Report privately through either:

- GitHub private vulnerability reporting: the **Report a vulnerability** button on the repository's Security tab, or
- email to **contact@opsorama.dev** with the subject "Security".

Include the affected package and version (or commit), a description, reproduction steps and the impact you expect. You will get an acknowledgement as soon as a maintainer has read the report; fixes and disclosure are coordinated with you, and credit is given unless you prefer otherwise.

## Scope

Opsorama renders data the host application passes to it. Host authentication, authorization, data sources and commands are outside the toolkit; report problems in how the toolkit handles that data (for example SVG surface labels, HTML labels or markers) here.
