# Security Policy

## We Take Security Seriously

Even if we don't take our bookmark reading habits seriously.

Your data matters to us. ADHX stores your Twitter/X bookmarks locally, and we want to keep them safe (so you can continue to ignore them in peace).

## Supported Versions

We provide security updates for the latest major version.

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | ✅ Yes             |
| < 1.0   | ❌ No              |

## Reporting a Vulnerability

Found a security issue? First off, thank you! Second, please **don't** post it publicly.

### How to Report

1. **Email us privately** at [security@adhx.com](mailto:security@adhx.com)
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (if you have them)

### What to Expect

- **24-48 hours**: We'll acknowledge receipt
- **7 days**: We'll provide an initial assessment
- **30-90 days**: We'll work on a fix (depending on severity)

### What We Promise

- We won't take legal action against good-faith security researchers
- We'll credit you in the fix (unless you prefer to stay anonymous)
- We'll keep you updated on our progress
- We'll let you know when it's safe to disclose publicly

## Security Best Practices

When self-hosting ADHX:

### Do

- ✅ Use HTTPS in production
- ✅ Set a strong `SESSION_SECRET` environment variable
- ✅ Keep your dependencies updated
- ✅ Back up your SQLite database regularly
- ✅ Use a reverse proxy (nginx, Caddy) in production

### Don't

- ❌ Expose your database file publicly
- ❌ Share your Twitter API credentials
- ❌ Run as root in production
- ❌ Ignore security updates (we know you're busy bookmarking things)

## Known Security Measures

ADHX includes:

- **JWT-signed sessions** – Your session cookies are cryptographically signed
- **PKCE OAuth flow** – Secure Twitter/X authentication
- **SQL injection protection** – All queries use parameterized statements via Drizzle ORM
- **Local-first storage** – Your bookmarks stay on your server, not ours

## Scope

The following are **in scope** for security reports:

- Authentication/authorization bypasses
- Data exposure vulnerabilities
- SQL injection
- XSS (Cross-Site Scripting)
- CSRF (Cross-Site Request Forgery)
- Insecure dependencies with known CVEs

The following are **out of scope**:

- Social engineering attacks
- Physical attacks
- Denial of service (we're a bookmark manager, not a bank)
- Issues in dependencies we don't control
- Self-inflicted issues from misconfiguration

---

*Thanks for helping keep ADHX secure. Your future self (and their 1,000 unread bookmarks) thanks you.* 🔒
