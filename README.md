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

### To setup keys

To refresh keys, use the following commands:

```
# Generate RSA private key (PKCS#8, 2048-bit)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem

# Copy the private.pem file to Cloudflare secrets

# 2) Extract public key from that private key
openssl pkey -in private.pem -pubout -out public.pem

n=$(openssl rsa -pubin -in public.pem -noout -modulus | cut -d= -f2 | xxd -r -p | basenc --base64url | tr -d '=')
e_dec=$(openssl rsa -pubin -in public.pem -noout -text 2>/dev/null | awk '/Exponent:/{print $2; exit}')
e=$(python3 -c "import base64; e=int('$e_dec'); b=e.to_bytes((e.bit_length()+7)//8,'big'); print(base64.urlsafe_b64encode(b).decode().rstrip('='))")
echo "n=$n"
echo "e=$e"

# Replace n and e in the /routes/jwks.js file
```

### To Grade

Have students copy and paste this in their terminal (codespaces):

```
curl -fsSL https://test.jmadar.workers.dev/scripts/submit.sh | bash
```

Or execute this to test:

```
curl -XPOST -d '{
    "contextCode": ${Assignment_Context_Code_From_Launch},
    "grade": 0,
    "comment": "Initial grade submission from LTI Bridge"
  }' https://test.jmadar.workers.dev/update-grade

```

This will automatically run `pytest`, calculate the grades, and submit to grading.