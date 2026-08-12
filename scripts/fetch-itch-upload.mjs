#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";

const ARCHIVE_ROOT = path.resolve(process.cwd(), "public", "asset-packs", "archives");

function readArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value == null) {
      throw new Error(`Invalid argument near ${key ?? "the end of the command"}.`);
    }
    values[key.slice(2)] = value;
  }
  return values;
}

function requireSafeOutput(output) {
  const resolved = path.resolve(output);
  const relative = path.relative(ARCHIVE_ROOT, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Output must be a file inside ${ARCHIVE_ROOT}.`);
  }
  return resolved;
}

function requireItchOrigin(value) {
  const origin = new URL(value);
  if (origin.protocol !== "https:" || !/(^|\.)itch\.io$/i.test(origin.hostname)) {
    throw new Error("The creator origin must be an HTTPS itch.io host.");
  }
  return origin.origin;
}

function requireCdnUrl(value) {
  const url = new URL(value);
  const allowed =
    url.protocol === "https:" &&
    (/(^|\.)itch\.zone$/i.test(url.hostname) ||
      /(^|\.)cloudflarestorage\.com$/i.test(url.hostname) ||
      /(^|\.)hwcdn\.net$/i.test(url.hostname));
  if (!allowed) {
    throw new Error(`itch.io returned an unexpected download host: ${url.hostname}`);
  }
  return url;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const origin = requireItchOrigin(args.origin);
  const slug = String(args.slug ?? "");
  const uploadId = String(args["upload-id"] ?? "");
  const csrf = String(args.csrf ?? "");
  const output = requireSafeOutput(args.output ?? "");
  const maxBytes = Number(args["max-bytes"] ?? 1_000_000_000);

  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error("Invalid itch.io project slug.");
  if (!/^\d+$/.test(uploadId)) throw new Error("Invalid itch.io upload id.");
  if (!csrf) throw new Error("A page-generated itch.io CSRF token is required.");
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("Invalid maximum byte count.");

  const endpoint = new URL(`/${slug}/file/${uploadId}`, origin);
  endpoint.searchParams.set("source", "game_download");
  endpoint.searchParams.set("after_download_lightbox", "1");
  endpoint.searchParams.set("as_props", "1");

  let authorizeResponse;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    authorizeResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        origin,
        referer: `${origin}/${slug}?download`,
      },
      body: new URLSearchParams({ csrf_token: csrf }),
    });
    if (authorizeResponse.status !== 429 && authorizeResponse.status < 500) break;
    if (attempt === 5) break;
    const retryAfter = Number(authorizeResponse.headers.get("retry-after") ?? 0);
    const waitMs = retryAfter > 0 ? retryAfter * 1_000 : Math.min(30_000, 2_000 * 2 ** attempt);
    process.stderr.write(`itch.io returned ${authorizeResponse.status}; retrying in ${waitMs} ms.\n`);
    await delay(waitMs);
  }
  if (!authorizeResponse) throw new Error("itch.io download authorization did not return a response.");
  if (!authorizeResponse.ok) {
    throw new Error(`itch.io download authorization failed (${authorizeResponse.status}).`);
  }
  const authorization = await authorizeResponse.json();
  if (authorization.errors?.length) throw new Error(authorization.errors.join(", "));
  const downloadUrl = requireCdnUrl(authorization.url);

  const downloadResponse = await fetch(downloadUrl, { redirect: "follow" });
  if (!downloadResponse.ok || !downloadResponse.body) {
    throw new Error(`Archive download failed (${downloadResponse.status}).`);
  }
  const declaredBytes = Number(downloadResponse.headers.get("content-length") ?? 0);
  if (declaredBytes > maxBytes) {
    throw new Error(`Archive is ${declaredBytes} bytes, above the ${maxBytes}-byte limit.`);
  }

  await mkdir(path.dirname(output), { recursive: true });
  const partial = `${output}.partial`;
  await rm(partial, { force: true });
  const hash = createHash("sha256");
  let receivedBytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        callback(new Error(`Archive exceeded the ${maxBytes}-byte limit while downloading.`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(downloadResponse.body), meter, createWriteStream(partial, { flags: "wx" }));
    await rename(partial, output);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }

  const file = await stat(output);
  process.stdout.write(
    `${JSON.stringify({ output, bytes: file.size, sha256: hash.digest("hex"), uploadId }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
