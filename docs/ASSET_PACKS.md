# Asset-pack repository layout

LoopLab commits the installed, browseable asset files under `public/asset-packs/installed/` together with the commercial-use/license catalog and per-file indexes under `public/asset-packs/index/`.

Original downloaded ZIP/RAR archives remain local under `public/asset-packs/archives/` and are intentionally ignored by Git. They duplicate the installed files, total hundreds of megabytes, and include a source archive that exceeds GitHub's 100 MiB per-file limit. Excluding them does not remove any asset shown by LoopLab's pack browser.

The indexes retain each archive's source upload ID, byte count, SHA-256 digest, installed-file count, and archive-only-file count. Creator and license URLs remain attached to every pack. To rebuild indexes after restoring source archives from their creator pages, run:

```powershell
node scripts/install-asset-packs.mjs
```

Do not replace the verified CC0/commercial-use metadata with a price-only assumption. A free download is not automatically unrestricted for commercial use.
