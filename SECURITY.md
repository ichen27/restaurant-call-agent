# Security and deployment boundaries

The self-contained demo uses synthetic data in temporary, isolated sessions. It does not accept payment information, place calls, or connect to production storage. Do not enter real customer data into a public demonstration.

The provider-backed application requires configured staff credentials, internal service authentication, provider request verification, and a deployment review before handling real callers. Default development accounts must not be used for a public staff deployment.

Keep credentials and raw customer information out of issues, screenshots, logs, and pull requests. For a suspected vulnerability, use GitHub's private vulnerability reporting feature if available; otherwise contact the repository owner privately rather than publishing exploit details.
