export const ASSET_PACK_ARCHIVES = Object.freeze([
  {
    packId: "platformer-explorer",
    archives: [
      { id: "ase-source", file: "platformer-explorer/ase-files.zip", uploadId: "18161218", label: "Editable Aseprite sources", includeExtensions: [] },
      { id: "sprite-sheets", file: "platformer-explorer/sprite-sheets.zip", uploadId: "18161219", label: "PNG sprite sheets", includeExtensions: [".png", ".txt", ".md"] },
    ],
  },
  {
    packId: "tiny-platformer-pack",
    archives: [
      { id: "tiles", file: "tiny-platformer-pack/pack.rar", uploadId: "8871232", label: "Tile sheets and individual tiles", includeExtensions: [".png", ".txt", ".md"] },
    ],
  },
  {
    packId: "isometric-town-pack",
    archives: [
      { id: "tiles", file: "isometric-town-pack/pack.rar", uploadId: "3813979", label: "Isometric town tiles", includeExtensions: [".png", ".txt", ".md", ".tmx", ".tsx", ".xml"] },
      { id: "examples", file: "isometric-town-pack/examples.rar", uploadId: "7085852", label: "Tiled map examples", includeExtensions: [".png", ".txt", ".md", ".tmx", ".tsx", ".xml"] },
    ],
  },
  {
    packId: "tiny-texture-pack-2",
    archives: [
      { id: "128", file: "tiny-texture-pack-2/128.zip", uploadId: "6021312", label: "128×128 textures", includeExtensions: [".png", ".txt", ".md"] },
      { id: "256", file: "tiny-texture-pack-2/256.zip", uploadId: "6021313", label: "256×256 textures", includeExtensions: [".png", ".txt", ".md"] },
      { id: "512", file: "tiny-texture-pack-2/512.zip", uploadId: "6021314", label: "512×512 textures", includeExtensions: [".png", ".txt", ".md"] },
    ],
  },
  {
    packId: "seamless-space-backgrounds",
    archives: [
      { id: "1024", file: "seamless-space-backgrounds/space-backgrounds-1024.rar", uploadId: "6605212", label: "1024×1024 backgrounds", includeExtensions: [".png", ".jpg", ".jpeg", ".txt", ".md"] },
      { id: "512", file: "seamless-space-backgrounds/space-backgrounds-512.rar", uploadId: "7104797", label: "512×512 backgrounds", includeExtensions: [".png", ".jpg", ".jpeg", ".txt", ".md"] },
    ],
  },
  {
    packId: "game-icon-pack",
    archives: [
      { id: "png", file: "game-icon-pack/png.zip", uploadId: "18000695", label: "PNG icons", includeExtensions: [".png", ".txt", ".md"] },
      { id: "svg-source", file: "game-icon-pack/svg.zip", uploadId: "18000696", label: "SVG source archive", includeExtensions: [] },
    ],
  },
  {
    packId: "one-bit-pixel-icons",
    archives: [
      { id: "icons", file: "one-bit-pixel-icons/icons.zip", uploadId: "15668268", label: "Sheets and individual pixel icons", includeExtensions: [".png", ".txt", ".md"] },
    ],
  },
  {
    packId: "simple-game-button-pack",
    archives: [
      { id: "rectangular", file: "simple-game-button-pack/rectangular-buttons.rar", uploadId: "3813998", label: "Rectangular buttons", includeExtensions: [".png", ".txt", ".md"] },
      { id: "rounded", file: "simple-game-button-pack/rounded-buttons.rar", uploadId: "3813999", label: "Rounded buttons", includeExtensions: [".png", ".txt", ".md"] },
    ],
  },
  {
    packId: "ggbotnet-fonts-cc0",
    archives: [
      { id: "fonts", file: "ggbotnet-fonts-cc0/fonts.zip", uploadId: "15872080", label: "Desktop and web fonts", includeExtensions: [".ttf", ".otf", ".woff", ".woff2", ".txt", ".md"] },
    ],
  },
  {
    packId: "high-quality-16-bit-rpg-music",
    archives: [
      { id: "music", file: "high-quality-16-bit-rpg-music/music.zip", uploadId: "13851939", label: "Browser-ready MP3 tracks", includeExtensions: [".mp3", ".png", ".txt", ".md"] },
      { id: "midi", file: "high-quality-16-bit-rpg-music/midi.zip", uploadId: "15305909", label: "MIDI sources", includeExtensions: [".mid", ".midi", ".txt", ".md"] },
    ],
  },
  {
    packId: "interface-sfx-pack-1",
    archives: [
      { id: "ogg", file: "interface-sfx-pack-1/ogg.zip", uploadId: "195827", label: "Browser-ready OGG effects", includeExtensions: [".ogg", ".txt", ".md"] },
      { id: "wav-source", file: "interface-sfx-pack-1/wav.zip", uploadId: "195829", label: "Lossless WAV source archive", includeExtensions: [] },
    ],
  },
]);

export function getAssetPackArchiveDefinition(packId) {
  return ASSET_PACK_ARCHIVES.find((entry) => entry.packId === packId) ?? null;
}
