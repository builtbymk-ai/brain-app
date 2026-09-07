import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2Bucket } = env;
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    throw new Error('Cloudflare R2 is not configured.');
  }
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
  return client;
}

export function isR2Configured(): boolean {
  return Boolean(env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey && env.r2Bucket);
}

/** Upload a file to R2 and return the object key. */
export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<void> {
  const { r2Bucket } = env;
  if (!r2Bucket) throw new Error('R2 bucket not configured.');
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/** Generate a short-lived presigned download URL for an object key. */
export async function createDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const { r2Bucket } = env;
  if (!r2Bucket) throw new Error('R2 bucket not configured.');
  const s3 = getClient();
  const command = new GetObjectCommand({ Bucket: r2Bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}
