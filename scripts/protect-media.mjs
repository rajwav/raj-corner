import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getMediaRegistry, normalizeMediaPath } from '../src/lib/access-control/media.ts';

async function protectPrivateMedia() {
  console.log('🛡️  Running build-time media perimeter protection...');
  const registry = await getMediaRegistry();
  const staticDir = path.join(process.cwd(), '.vercel/output/static');

  let protectedCount = 0;
  let publicCount = 0;

  for (const [mediaPath, info] of registry) {
    if (info.isProtected) {
      const targetStaticFile = path.join(staticDir, mediaPath);
      try {
        await fs.access(targetStaticFile);
        await fs.unlink(targetStaticFile);
        protectedCount++;
        console.log(`   🔒 Protected private media removed from public static CDN: /${mediaPath}`);
      } catch (e) {
        // File may not exist in static output, already protected
      }
    } else {
      publicCount++;
    }
  }

  console.log(`   ✓ Media protection complete: ${protectedCount} private file(s) secured, ${publicCount} public asset(s) preserved.\n`);
}

protectPrivateMedia().catch(err => {
  console.error('Error during media protection:', err);
  process.exit(1);
});
