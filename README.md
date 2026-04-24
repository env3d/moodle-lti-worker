# moodle-lti-worker

A worker deployed on cloudflare to bridge moodle and external tools using LTI 1.3 protocol.  
Technically should work with other LMS

```
npm install -g wrangler
```

### Local Dev

For Local Development: Create a .dev.vars file (this is automatically ignored by Git if you use the standard template, but double-check!):

```plaintext
LTI_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Then `wranger dev`

### To Deploy

Need to login to CloudFlare using the following:
```bash
export CLOUDFLARE_API_TOKEN=${YOUR_CLOUDFLARE_API_TOKEN}
```

Then execute
```bash
wranger deploy
```

### To Grade

Have students copy and paste this in their terminal (codespaces):

```
curl -fsSL https://<your-worker-domain>/scripts/submit.sh | bash
```

This will automatically run `pytest`, calculate the grades, and submit to grading.