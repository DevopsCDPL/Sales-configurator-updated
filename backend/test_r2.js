require('dotenv').config({ path: '.env' });
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
console.log('Endpoint:', endpoint);
console.log('Access Key:', (process.env.R2_ACCESS_KEY_ID || '').slice(0, 8) + '...');
console.log('Bucket:', process.env.R2_BUCKET_NAME);

const s3 = new S3Client({
  region: 'auto',
  endpoint: endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

(async () => {
  try {
    console.log('Testing upload...');
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || 'forge-files',
      Key: 'test/hello.txt',
      Body: Buffer.from('Hello from Forged IDAS'),
      ContentType: 'text/plain',
    }));
    console.log('SUCCESS: File uploaded to R2!');
  } catch (err) {
    console.error('UPLOAD FAILED:', err.name, '-', err.message);
    if (err.$metadata) console.error('HTTP Status:', err.$metadata.httpStatusCode);
  }
})();
