import { KINETIC_COURIER_V2_DATA_URL, KINETIC_COURIER_V2_REPORT } from "./generated/kinetic-courier-v2.mjs";

export const KINETIC_CITY_SCAFFOLD_VERSION = "2.1.0";

const LEGACY_DARK_GENERATION_MATTE = Object.freeze({
  color: "#3a3a3a",
  name: "dark-neutral-gray",
  extraction: "border-connected-neutral-matte",
  finalOutput: "transparent",
  forbiddenMattes: ["green", "#00ff00"],
});

const PALETTE = Object.freeze({
  void: "#080b1f",
  ink: "#15182f",
  shadow: "#191d3f",
  dusk: "#242858",
  river: "#163c68",
  steel: "#7084a8",
  indigo: "#4c46e5",
  violet: "#8b5cf6",
  lavender: "#b8b7ff",
  cyan: "#31d7f4",
  aqua: "#78efff",
  coral: "#ff5d73",
  lime: "#c8ff4d",
  cream: "#fff5d6",
  warm: "#ffc47d",
});

const ART_DIRECTION = Object.freeze({
  id: "kinetic-city-night-v2",
  style: "illustrated-neon-city",
  reference: "docs/art-references/kinetic-city-night-art-target-v2.png",
  palettePolicy: "one-fixed-palette-across-environment-and-animation",
  generationMatte: {
    color: "#d9d9d9",
    name: "light-neutral-gray",
    extraction: "border-connected-neutral-matte",
    use: ["game-art-review", "background-keying"],
    finalOutput: "transparent",
    forbiddenMattes: ["green", "#00ff00"],
  },
  palette: Object.values(PALETTE),
  gameplayColors: {
    hazard: PALETTE.coral,
    pickupAndGoal: PALETTE.lime,
    traversal: PALETTE.cyan,
    playerPrimary: PALETTE.violet,
  },
  rules: [
    "coral-is-reserved-for-hazards",
    "lime-is-reserved-for-pickups-and-goals",
    "cyan-marks-traversal-and-movement",
    "environment-uses-layered-depth-and-material-shapes",
    "generated-art-never-owns-collision",
  ],
});

const clone = (value) => JSON.parse(JSON.stringify(value));

function utf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const block = (first << 16) | (second << 8) | third;
    encoded += alphabet[(block >> 18) & 63];
    encoded += alphabet[(block >> 12) & 63];
    encoded += index + 1 < bytes.length ? alphabet[(block >> 6) & 63] : "=";
    encoded += index + 2 < bytes.length ? alphabet[block & 63] : "=";
  }
  return encoded;
}

const svgDataUrl = (svg) => `data:image/svg+xml;base64,${utf8Base64(svg)}`;

function spriteAsset({ id, name, svg, dataUrl, width, height, frameWidth = width, frameHeight = height, frames = 1, columns = 1, anchorX = frameWidth / 2, anchorY = frameHeight - 1, role, generatorKind = "directed-scaffold", report = null }) {
  const generationMatte = report?.backgroundPolicy === "border-connected-dark-neutral-gray"
    ? LEGACY_DARK_GENERATION_MATTE
    : ART_DIRECTION.generationMatte;
  return {
    id,
    name,
    type: "sprite",
    dataUrl: dataUrl ?? svgDataUrl(svg),
    width,
    height,
    frameWidth,
    frameHeight,
    frames,
    columns,
    anchorX,
    anchorY,
    opaqueBounds: { x: 0, y: 0, width: frameWidth, height: frameHeight },
    colliderBounds: { x: Math.round(frameWidth * 0.18), y: Math.round(frameHeight * 0.08), width: Math.round(frameWidth * 0.64), height: Math.round(frameHeight * 0.9) },
    collisionPolicy: "authored-only",
    anchorMode: "ground",
    invariants: {
      identity: role ?? id,
      palette: report?.palette ?? Object.values(PALETTE),
      scale: `${frameWidth}x${frameHeight}`,
      anchor: "bottom-center",
      maxSilhouetteDrift: 0.14,
      maxAnchorVariance: 1,
    },
    analysis: report
      ? {
          anchorVariance: report.anchorVariance,
          characterCountMax: 1,
          onPalette: report.onPalette,
          encodedBytes: report.byteLength,
          decodedRgbaBytes: report.decodedRgbaBytes,
          sourceSha256: report.sha256,
          sharedScale: report.sharedScale,
          paletteUsageByFrame: report.paletteUsageByFrame,
          backgroundPolicy: report.backgroundPolicy,
          outlineColor: report.outlineColor,
          minimumComponentPixels: report.minimumComponentPixels,
          removedSpeckPixels: report.removedSpeckPixels,
        }
      : null,
    generator: { kind: generatorKind, version: KINETIC_CITY_SCAFFOLD_VERSION, styleId: "kinetic-city-night", artDirectionId: ART_DIRECTION.id, palettePolicy: ART_DIRECTION.palettePolicy, generationMatte, role: role ?? id, containsText: false },
  };
}

function tileAsset({ id, name, svg, width, height }) {
  return {
    id,
    name,
    type: "tileset",
    dataUrl: svgDataUrl(svg),
    width,
    height,
    frameWidth: width,
    frameHeight: height,
    frames: 1,
    columns: 1,
    anchorX: width / 2,
    anchorY: height - 1,
    opaqueBounds: { x: 0, y: 0, width, height },
    colliderBounds: { x: 0, y: 0, width, height },
    collisionPolicy: "authored-only",
    anchorMode: "ground",
    generator: { kind: "directed-scaffold", version: KINETIC_CITY_SCAFFOLD_VERSION, styleId: "kinetic-city-night", artDirectionId: ART_DIRECTION.id, palettePolicy: ART_DIRECTION.palettePolicy, role: "surface", seamless: true, containsText: false },
  };
}

function buildAssets() {
  const plazaBackdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="420" viewBox="0 0 1280 420">
    <defs>
      <linearGradient id="plaza-sky" x2="0" y2="1"><stop stop-color="#080b1f"/><stop offset=".55" stop-color="#191d3f"/><stop offset="1" stop-color="#242858"/></linearGradient>
      <linearGradient id="plaza-haze" x2="1" y2="0"><stop stop-color="#4c46e5" stop-opacity="0"/><stop offset=".48" stop-color="#8b5cf6" stop-opacity=".35"/><stop offset="1" stop-color="#4c46e5" stop-opacity="0"/></linearGradient>
      <linearGradient id="plaza-glass" x2="0" y2="1"><stop stop-color="#7084a8"/><stop offset=".28" stop-color="#242858"/><stop offset="1" stop-color="#15182f"/></linearGradient>
      <pattern id="plaza-windows" width="24" height="22" patternUnits="userSpaceOnUse"><rect x="4" y="4" width="7" height="5" rx="1" fill="#ffc47d"/><rect x="15" y="4" width="5" height="5" rx="1" fill="#b8b7ff" opacity=".62"/></pattern>
    </defs>
    <rect width="1280" height="420" fill="url(#plaza-sky)"/>
    <path d="M0 172C190 116 350 204 526 146s338-36 514 12 176-4 240-22v150H0Z" fill="url(#plaza-haze)"/>
    <g fill="#b8b7ff" opacity=".8"><circle cx="58" cy="72" r="2"/><circle cx="326" cy="58" r="1.5"/><circle cx="528" cy="84" r="2"/><circle cx="734" cy="46" r="1.5"/><circle cx="936" cy="74" r="2"/><circle cx="1180" cy="52" r="1.5"/></g>
    <circle cx="170" cy="92" r="66" fill="#fff5d6" opacity=".14"/><circle cx="170" cy="92" r="51" fill="#fff5d6"/><path d="M139 70c18-15 48-13 62 3M146 111c20 11 45 9 58-5" fill="none" stroke="#ffc47d" stroke-width="6" opacity=".42"/>
    <g fill="#15182f" opacity=".72"><path d="M0 294V220h42v74zm54 0V188h54v106zm66 0V236h60v58zm72 0V166h76v128zm92 0V210h48v84zm70 0V142h70v152zm84 0V198h56v96zm70 0V170h88v124zm104 0V216h54v78zm74 0V154h74v140zm88 0V196h50v98zm70 0V132h86v162zm100 0V188h64v106zm78 0V158h70v136z"/><path d="M374 142l35-54 35 54zM946 154l37-64 37 64z"/></g>
    <g fill="url(#plaza-glass)" stroke="#7084a8" stroke-width="2"><rect x="24" y="228" width="142" height="132"/><rect x="184" y="184" width="126" height="176"/><rect x="334" y="124" width="150" height="236"/><rect x="508" y="204" width="136" height="156"/><rect x="676" y="168" width="160" height="192"/><rect x="860" y="112" width="144" height="248"/><rect x="1028" y="178" width="216" height="182"/></g>
    <g fill="url(#plaza-windows)" opacity=".82"><rect x="36" y="244" width="118" height="92"/><rect x="196" y="202" width="102" height="132"/><rect x="348" y="146" width="122" height="188"/><rect x="522" y="220" width="108" height="114"/><rect x="690" y="188" width="132" height="146"/><rect x="874" y="136" width="116" height="198"/><rect x="1042" y="198" width="188" height="136"/></g>
    <path d="M0 270C176 252 306 230 466 218s316-4 468 22 222 20 346-6v28C1090 288 914 272 728 250s-354 4-520 30S68 296 0 294Z" fill="#080b1f"/>
    <path d="M0 267C196 249 314 226 470 218s312 2 468 24 220 18 342-8" fill="none" stroke="#7084a8" stroke-width="7"/><path d="M0 278C206 260 328 238 474 232s304 8 462 28 220 12 344-10" fill="none" stroke="#b8b7ff" stroke-width="2" opacity=".7"/>
    <g fill="#15182f"><path d="M164 255h18v105h-18zm292-37h20v142h-20zm474 18h20v124h-20zm228 12h18v112h-18z"/><path d="M132 252h82v12h-82zm288-40h92v12h-92zm470 18h100v12H890zm236 12h82v12h-82z"/></g>
    <path d="M0 350C170 316 318 378 486 344s304-24 448 6 230-36 346-18v88H0Z" fill="#163c68" opacity=".72"/>
    <g fill="none" stroke-linecap="round"><path d="M26 374h194m48 20h286m64-28h238m58 22h330" stroke="#7084a8" stroke-width="5" opacity=".62"/><path d="M92 402h238m98-34h150m334 34h230" stroke="#b8b7ff" stroke-width="3" opacity=".5"/></g>
    <path d="M0 408h1280v12H0Z" fill="#080b1f"/><path d="M0 408h1280" stroke="#8b5cf6" stroke-width="3" opacity=".72"/>
  </svg>`;
  const riverBackdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="420" viewBox="0 0 1280 420">
    <defs>
      <linearGradient id="river-sky" x2="0" y2="1"><stop stop-color="#080b1f"/><stop offset=".56" stop-color="#191d3f"/><stop offset="1" stop-color="#163c68"/></linearGradient>
      <linearGradient id="river-water" x2="1" y2="0"><stop stop-color="#080b1f"/><stop offset=".34" stop-color="#163c68"/><stop offset=".68" stop-color="#242858"/><stop offset="1" stop-color="#4c46e5"/></linearGradient>
      <linearGradient id="river-glass" x2="0" y2="1"><stop stop-color="#7084a8"/><stop offset=".36" stop-color="#242858"/><stop offset="1" stop-color="#15182f"/></linearGradient>
      <pattern id="river-windows" width="22" height="20" patternUnits="userSpaceOnUse"><rect x="4" y="4" width="6" height="5" fill="#78efff" opacity=".7"/><rect x="14" y="4" width="4" height="5" fill="#ffc47d" opacity=".72"/></pattern>
    </defs>
    <rect width="1280" height="420" fill="url(#river-sky)"/>
    <g fill="#b8b7ff" opacity=".72"><circle cx="102" cy="58" r="1.5"/><circle cx="276" cy="78" r="2"/><circle cx="518" cy="48" r="1.5"/><circle cx="742" cy="68" r="2"/><circle cx="982" cy="44" r="1.5"/><circle cx="1202" cy="84" r="2"/></g>
    <circle cx="1084" cy="84" r="62" fill="#fff5d6" opacity=".12"/><circle cx="1084" cy="84" r="46" fill="#fff5d6"/><path d="M1058 62c15-9 34-8 47 4M1064 102c13 8 30 8 42 0" fill="none" stroke="#ffc47d" stroke-width="5" opacity=".42"/>
    <g fill="#15182f" opacity=".76"><path d="M0 286V208h50v78zm62 0V180h66v106zm80 0V224h54v62zm70 0V154h70v132zm86 0V204h52v82zm72 0V122h74v164zm90 0V188h52v98zm68 0V146h84v140zm100 0V212h62v74zm80 0V164h70v122zm86 0V198h54v88zm74 0V132h82v154zm98 0V188h62v98zm76 0V156h84v130z"/><path d="M430 122l37-58 37 58zM892 132l35-52 35 52z"/></g>
    <g fill="url(#river-glass)" stroke="#7084a8" stroke-width="2"><rect x="34" y="218" width="130" height="116"/><rect x="184" y="174" width="118" height="160"/><rect x="324" y="118" width="146" height="216"/><rect x="496" y="194" width="128" height="140"/><rect x="650" y="144" width="142" height="190"/><rect x="818" y="190" width="120" height="144"/><rect x="960" y="152" width="128" height="182"/><rect x="1110" y="202" width="144" height="132"/></g>
    <g fill="url(#river-windows)" opacity=".7"><rect x="48" y="234" width="102" height="78"/><rect x="198" y="192" width="90" height="120"/><rect x="338" y="140" width="118" height="172"/><rect x="510" y="212" width="100" height="100"/><rect x="664" y="164" width="114" height="148"/><rect x="832" y="208" width="92" height="104"/><rect x="974" y="172" width="100" height="140"/><rect x="1124" y="220" width="116" height="92"/></g>
    <path d="M-20 244C164 238 304 214 474 206s332 22 482 22 224-22 344-18v28c-166-4-302 24-466 18s-306-26-462-18-264 28-392 34Z" fill="#080b1f"/>
    <path d="M0 242C168 236 312 212 476 206s326 20 478 22 224-22 326-18" fill="none" stroke="#7084a8" stroke-width="8"/><path d="M0 252C170 246 314 224 478 220s322 18 476 20 224-20 326-18" fill="none" stroke="#b8b7ff" stroke-width="2"/>
    <g fill="#15182f"><path d="M174 230h22v104h-22zm278-24h22v128h-22zm478 20h22v108h-22zm216-20h22v128h-22z"/><path d="M136 226h98v12h-98zm278-26h100v12H414zm478 20h98v12h-98zm216-20h98v12h-98z"/></g>
    <path d="M0 292C190 268 304 316 486 292s304-18 450 8 230 4 344-16v136H0Z" fill="url(#river-water)"/>
    <g fill="none" stroke-linecap="round"><path d="M30 318h226m56 28h330m72-32h290m56 42h188" stroke="#7084a8" stroke-width="6" opacity=".66"/><path d="M86 382h292m80-62h152m182 70h314" stroke="#78efff" stroke-width="3" opacity=".58"/><path d="M140 362h132m392 18h202m210-62h130" stroke="#b8b7ff" stroke-width="3" opacity=".5"/><path d="M28 404h174m224-24h246m224 22h340" stroke="#ffc47d" stroke-width="2" opacity=".42"/></g>
    <path d="M0 408h1280v12H0Z" fill="#080b1f"/><path d="M0 408h1280" stroke="#4c46e5" stroke-width="3"/>
  </svg>`;
  const skater = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="72" viewBox="0 0 256 72">
    <g stroke="#080b1f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <g transform="translate(0)">
        <ellipse cx="32" cy="68" rx="25" ry="3" fill="#080b1f" opacity=".45" stroke="none"/>
        <path d="M9 63h48l-5 5H14z" fill="#31d7f4"/><path d="M17 64h33" stroke="#78efff" stroke-width="2"/>
        <circle cx="17" cy="68" r="3" fill="#b8b7ff"/><circle cx="49" cy="68" r="3" fill="#b8b7ff"/>
        <path d="M28 38l-8 20 9 5 8-21z" fill="#4c46e5"/><path d="M36 40l3 17 12 6 3-6-10-19z" fill="#8b5cf6"/>
        <path d="M24 18l18-4 7 19-19 8-9-10z" fill="#8b5cf6"/><path d="M25 22l15-3 3 7-15 5z" fill="#31d7f4" stroke="none"/>
        <path d="M25 24L12 39l5 5 14-11M43 24l13 13-5 5-13-10" fill="none" stroke="#4c46e5" stroke-width="6"/>
        <circle cx="35" cy="11" r="9" fill="#fff5d6"/><path d="M26 10Q28 1 38 2q8 1 9 8l-8-2z" fill="#4c46e5"/><path d="M35 10h10" stroke="#78efff" stroke-width="3"/>
      </g>
      <g transform="translate(64)">
        <ellipse cx="32" cy="68" rx="26" ry="3" fill="#080b1f" opacity=".45" stroke="none"/>
        <path d="M7 63h50l-5 5H12z" fill="#31d7f4"/><path d="M16 64h35" stroke="#78efff" stroke-width="2"/>
        <circle cx="15" cy="68" r="3" fill="#b8b7ff"/><circle cx="51" cy="68" r="3" fill="#b8b7ff"/>
        <path d="M30 39L17 57l8 6 15-20z" fill="#4c46e5"/><path d="M39 40l7 11 11 5-3 7-14-6-8-13z" fill="#8b5cf6"/>
        <path d="M27 18l18 1 3 18-20 5-8-12z" fill="#8b5cf6"/><path d="M27 23l16 1 1 7-15 3z" fill="#31d7f4" stroke="none"/>
        <path d="M25 24L9 34l3 6 18-8M43 26l16 5-2 7-17-4" fill="none" stroke="#4c46e5" stroke-width="6"/>
        <circle cx="39" cy="11" r="9" fill="#fff5d6"/><path d="M30 9q3-9 13-7 7 2 7 9l-9-2z" fill="#4c46e5"/><path d="M39 10h10" stroke="#78efff" stroke-width="3"/>
      </g>
      <g transform="translate(128)">
        <ellipse cx="33" cy="66" rx="24" ry="3" fill="#080b1f" opacity=".4" stroke="none"/>
        <path d="M9 59l47-9-4 6-39 8z" fill="#31d7f4"/><path d="M17 59l32-6" stroke="#78efff" stroke-width="2"/>
        <circle cx="18" cy="62" r="3" fill="#b8b7ff"/><circle cx="49" cy="56" r="3" fill="#b8b7ff"/>
        <path d="M30 35L17 48l9 5 13-13z" fill="#4c46e5"/><path d="M37 36l9 7 11 1-1 7-14 1-12-11z" fill="#8b5cf6"/>
        <path d="M26 15l19 2 2 17-20 5-8-11z" fill="#8b5cf6"/><path d="M26 20l16 2 1 6-15 3z" fill="#31d7f4" stroke="none"/>
        <path d="M24 21L8 27l2 7 18-5M43 23l17-2 1 7-18 3" fill="none" stroke="#4c46e5" stroke-width="6"/>
        <circle cx="39" cy="9" r="9" fill="#fff5d6"/><path d="M30 7q4-8 13-6 7 2 7 9l-9-2z" fill="#4c46e5"/><path d="M39 8h10" stroke="#78efff" stroke-width="3"/>
      </g>
      <g transform="translate(192)">
        <ellipse cx="32" cy="68" rx="27" ry="3" fill="#080b1f" opacity=".45" stroke="none"/>
        <path d="M6 62h52l-5 6H11z" fill="#31d7f4"/><path d="M15 64h38" stroke="#78efff" stroke-width="2"/>
        <circle cx="15" cy="68" r="3" fill="#b8b7ff"/><circle cx="51" cy="68" r="3" fill="#b8b7ff"/>
        <path d="M28 37L16 54l10 7 13-20z" fill="#4c46e5"/><path d="M37 38l8 12 12 5-3 7-14-5-10-15z" fill="#8b5cf6"/>
        <path d="M25 17l20 2 2 17-21 5-7-12z" fill="#8b5cf6"/><path d="M26 22l16 2 1 6-16 3z" fill="#31d7f4" stroke="none"/>
        <path d="M23 23L8 35l4 6 17-11M43 25l16 9-3 6-17-9" fill="none" stroke="#4c46e5" stroke-width="6"/>
        <circle cx="39" cy="10" r="9" fill="#fff5d6"/><path d="M30 8q4-8 13-6 7 2 7 9l-9-2z" fill="#4c46e5"/><path d="M39 9h10" stroke="#78efff" stroke-width="3"/>
      </g>
    </g>
  </svg>`;
  const token = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="32" viewBox="0 0 128 32"><defs><radialGradient id="token-glow"><stop stop-color="#fff5d6"/><stop offset=".45" stop-color="#c8ff4d"/><stop offset="1" stop-color="#4c46e5"/></radialGradient></defs><g stroke="#080b1f" stroke-width="2.5" stroke-linejoin="round"><g transform="translate(0)"><circle cx="16" cy="16" r="14" fill="#15182f"/><circle cx="16" cy="16" r="11" fill="url(#token-glow)"/><path d="m10 16 4 5 9-12" fill="none"/></g><g transform="translate(32)"><ellipse cx="16" cy="16" rx="11" ry="14" fill="#15182f"/><ellipse cx="16" cy="16" rx="8" ry="11" fill="#c8ff4d"/><path d="m12 16 4 5 7-12" fill="none"/></g><g transform="translate(64)"><ellipse cx="16" cy="16" rx="6" ry="14" fill="#15182f"/><ellipse cx="16" cy="16" rx="3" ry="11" fill="#fff5d6"/></g><g transform="translate(96)"><ellipse cx="16" cy="16" rx="11" ry="14" fill="#15182f"/><ellipse cx="16" cy="16" rx="8" ry="11" fill="#c8ff4d"/><path d="m12 16 4 5 7-12" fill="none"/></g></g></svg>`;
  const surface = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="36" viewBox="0 0 320 36"><defs><linearGradient id="surface-face" x2="0" y2="1"><stop stop-color="#242858"/><stop offset=".55" stop-color="#15182f"/><stop offset="1" stop-color="#080b1f"/></linearGradient><pattern id="surface-grain" width="40" height="36" patternUnits="userSpaceOnUse"><path d="M4 13h8m9 9h5m7-14h4" stroke="#7084a8" stroke-width="1" opacity=".38"/><circle cx="16" cy="28" r="1" fill="#b8b7ff" opacity=".25"/></pattern></defs><rect width="320" height="36" fill="url(#surface-face)"/><rect width="320" height="36" fill="url(#surface-grain)"/><path d="M0 3h320" stroke="#31d7f4" stroke-width="5"/><path d="M0 7h320" stroke="#78efff" stroke-width="1" opacity=".7"/><path d="M0 31h320" stroke="#4c46e5" stroke-width="7"/><path d="M0 27h320" stroke="#8b5cf6" stroke-width="2" opacity=".65"/></svg>`;
  const rail = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="48" viewBox="0 0 320 48"><defs><linearGradient id="rail-metal" x2="0" y2="1"><stop stop-color="#fff5d6"/><stop offset=".28" stop-color="#b8b7ff"/><stop offset=".7" stop-color="#7084a8"/><stop offset="1" stop-color="#242858"/></linearGradient></defs><ellipse cx="30" cy="44" rx="18" ry="4" fill="#080b1f" opacity=".62"/><ellipse cx="290" cy="44" rx="18" ry="4" fill="#080b1f" opacity=".62"/><path d="M18 14h284" stroke="#080b1f" stroke-width="12" stroke-linecap="round"/><path d="M18 13h284" stroke="url(#rail-metal)" stroke-width="7" stroke-linecap="round"/><path d="M20 10h280" stroke="#78efff" stroke-width="2" stroke-linecap="round"/><path d="M31 18v25m258-25v25" stroke="#080b1f" stroke-width="11"/><path d="M31 18v25m258-25v25" stroke="#7084a8" stroke-width="6"/><path d="M31 20v21m258-21v21" stroke="#31d7f4" stroke-width="2"/></svg>`;
  const hazard = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="44" viewBox="0 0 96 44"><path d="M2 42L18 9l14 33L48 9l16 33L79 9l15 33z" fill="#ff5d73" stroke="#15182f" stroke-width="4"/><path d="M13 35h70" stroke="#fff5d6" stroke-width="5" stroke-dasharray="8 6"/></svg>`;
  const portal = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="96" viewBox="0 0 72 96"><defs><linearGradient id="portal-frame" x2="0" y2="1"><stop stop-color="#78efff"/><stop offset=".45" stop-color="#31d7f4"/><stop offset="1" stop-color="#4c46e5"/></linearGradient><linearGradient id="portal-field" x2="0" y2="1"><stop stop-color="#78efff" stop-opacity=".08"/><stop offset="1" stop-color="#8b5cf6" stop-opacity=".55"/></linearGradient></defs><path d="M5 94V34C5 13 17 3 36 3s31 10 31 31v60" fill="none" stroke="#080b1f" stroke-width="11"/><path d="M10 94V35C10 18 20 9 36 9s26 9 26 26v59" fill="none" stroke="url(#portal-frame)" stroke-width="6"/><path d="M20 92V40c0-11 6-18 16-18s16 7 16 18v52Z" fill="url(#portal-field)" stroke="#242858" stroke-width="2"/><path d="M25 42h22M23 56h26M25 70h22M29 84h14" stroke="#78efff" stroke-width="2" opacity=".78"/><circle cx="36" cy="34" r="4" fill="#fff5d6"/></svg>`;
  const goal = `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="104" viewBox="0 0 88 104"><defs><linearGradient id="goal-frame" x2="0" y2="1"><stop stop-color="#c8ff4d"/><stop offset=".48" stop-color="#78efff"/><stop offset="1" stop-color="#4c46e5"/></linearGradient></defs><path d="M11 102V19h66v83" fill="none" stroke="#080b1f" stroke-width="13"/><path d="M12 102V20h64v82" fill="none" stroke="url(#goal-frame)" stroke-width="7"/><path d="M14 22h60v28H14z" fill="#15182f" stroke="#080b1f" stroke-width="4"/><path d="M20 29h10v14H20zm19 0h10v14H39zm19 0h10v14H58z" fill="#fff5d6"/><path d="M25 90 44 62l19 28" fill="none" stroke="#31d7f4" stroke-width="7" stroke-linecap="round"/><path d="M44 63v28" stroke="#c8ff4d" stroke-width="3"/></svg>`;

  return [
    spriteAsset({ id: "kinetic-backdrop-plaza", name: "Neon plaza skyline", svg: plazaBackdrop, width: 1280, height: 420, role: "environment" }),
    spriteAsset({ id: "kinetic-backdrop-river", name: "River arcade skyline", svg: riverBackdrop, width: 1280, height: 420, role: "environment" }),
    spriteAsset({ id: "kinetic-skater", name: "Kinetic courier animation v2", svg: skater, dataUrl: KINETIC_COURIER_V2_DATA_URL, width: KINETIC_COURIER_V2_REPORT.atlasWidth, height: KINETIC_COURIER_V2_REPORT.atlasHeight, frameWidth: KINETIC_COURIER_V2_REPORT.frameWidth, frameHeight: KINETIC_COURIER_V2_REPORT.frameHeight, frames: KINETIC_COURIER_V2_REPORT.frames, columns: KINETIC_COURIER_V2_REPORT.frames, anchorX: KINETIC_COURIER_V2_REPORT.frameWidth / 2, anchorY: KINETIC_COURIER_V2_REPORT.frameHeight - 1, role: "hero", generatorKind: "imagegen-normalized", report: KINETIC_COURIER_V2_REPORT }),
    spriteAsset({ id: "kinetic-token", name: "Momentum token animation", svg: token, width: 128, height: 32, frameWidth: 32, frameHeight: 32, frames: 4, columns: 4, anchorX: 16, anchorY: 31, role: "pickup" }),
    tileAsset({ id: "kinetic-surface", name: "Neon skate surface", svg: surface, width: 320, height: 36 }),
    spriteAsset({ id: "kinetic-rail", name: "Authoring-aligned grind rail", svg: rail, width: 320, height: 48, role: "rail-art" }),
    spriteAsset({ id: "kinetic-hazard", name: "Coral route hazard", svg: hazard, width: 96, height: 44, role: "hazard" }),
    spriteAsset({ id: "kinetic-portal", name: "Map transition gate", svg: portal, width: 72, height: 96, role: "portal" }),
    spriteAsset({ id: "kinetic-goal", name: "Finish gate", svg: goal, width: 88, height: 104, role: "goal" }),
  ];
}

const collider = (width, height, options = {}) => ({ enabled: true, offsetX: 0, offsetY: 0, width, height, trigger: false, oneWay: false, zMin: 0, zMax: 1, ...options });

function gameObject(kind, properties) {
  return {
    id: properties.id,
    name: properties.name,
    kind,
    x: properties.x,
    y: properties.y,
    width: properties.width,
    height: properties.height,
    color: properties.color ?? PALETTE.cream,
    solid: properties.solid ?? false,
    z: 0,
    supportZ: 0,
    anchorMode: "ground",
    collisionOwner: "authored-map",
    ...properties,
  };
}

function player(id, x) {
  return gameObject("player", { id, name: "Kinetic courier", x, y: 594, width: 80, height: 90, color: PALETTE.violet, assetId: "kinetic-skater", assetFrame: 0, collider: collider(40, 68, { offsetX: 20, offsetY: 22 }) });
}

function spawn(id, x) {
  return gameObject("spawn", { id, name: "Route checkpoint", x, y: 620, width: 64, height: 64, color: PALETTE.cyan, collider: { ...collider(64, 64), enabled: false } });
}

function floor(id) {
  return gameObject("platform", { id, name: "Continuous skate floor", x: 0, y: 684, width: 1280, height: 36, color: PALETTE.ink, solid: true, assetId: "kinetic-surface", assetFrame: 0, collider: collider(1280, 36, { oneWay: true }) });
}

function platform(id, name, x, y, width) {
  return gameObject("platform", { id, name, x, y, width, height: 32, color: PALETTE.ink, solid: true, assetId: "kinetic-surface", assetFrame: 0, collider: collider(width, 32, { oneWay: true }) });
}

function token(id, name, x, y) {
  return gameObject("coin", { id, name, x, y, width: 36, height: 36, color: PALETTE.lime, assetId: "kinetic-token", assetFrame: 0, collider: collider(28, 28, { offsetX: 4, offsetY: 4, trigger: true }) });
}

function rail(id, name, x, y, width = 320) {
  return gameObject("decor", { id, name, x, y, width, height: 48, color: PALETTE.cyan, assetId: "kinetic-rail", role: "rail", requiresSupport: false, blocksMovement: false, collider: { ...collider(width, 48), enabled: false }, depthLayer: 1 });
}

function hazard(id, name, x) {
  return gameObject("hazard", { id, name, x, y: 640, width: 96, height: 44, color: PALETTE.coral, assetId: "kinetic-hazard", collider: collider(88, 38, { offsetX: 4, offsetY: 6, trigger: true }) });
}

function backdrop(id, assetId) {
  return gameObject("decor", { id, name: "Connected city backdrop", x: 0, y: 40, width: 1280, height: 644, color: PALETTE.dusk, assetId, collider: { ...collider(1280, 644), enabled: false }, depthLayer: -10, depthBias: -100, allowHudOverlap: true });
}

function mapPortal() {
  return gameObject("portal", { id: "plaza-to-river", name: "River Arcade exit", x: 1176, y: 588, width: 72, height: 96, color: PALETTE.cyan, assetId: "kinetic-portal", targetMapId: "map-river", targetSpawnId: "river-spawn", transition: "fade", runtimeJoin: { version: 1, enabled: true, mode: "portal", sourceEdge: "right", targetEdge: "left", overlapPixels: 0, sampleDepth: 12, minimumUniquePixelRatio: 0.02, maximumBoundaryColorDelta: 1, requireExactSpawn: true, requireClearLanding: true }, collider: collider(52, 84, { offsetX: 10, offsetY: 12, trigger: true }) });
}

function finishGoal() {
  return gameObject("goal", { id: "river-finish", name: "Night route finish", x: 1136, y: 580, width: 88, height: 104, color: PALETTE.lime, assetId: "kinetic-goal", collider: collider(64, 92, { offsetX: 12, offsetY: 12, trigger: true }) });
}

function buildMaps() {
  const plazaObjects = [
    backdrop("plaza-backdrop", "kinetic-backdrop-plaza"),
    floor("plaza-floor"),
    platform("plaza-bank", "Launch bank", 744, 584, 224),
    rail("plaza-rail-art", "Plaza rhythm rail", 248, 600),
    spawn("plaza-spawn", 62),
    player("plaza-player", 62),
    token("plaza-token-1", "Line token one", 210, 622),
    token("plaza-token-2", "Line token two", 430, 552),
    hazard("plaza-hazard", "Coral route break", 620),
    token("plaza-token-3", "Bank token", 828, 528),
    token("plaza-token-4", "Exit token", 1042, 620),
    mapPortal(),
  ];
  const riverObjects = [
    backdrop("river-backdrop", "kinetic-backdrop-river"),
    floor("river-floor"),
    platform("river-deck", "Bridge transfer deck", 648, 560, 224),
    rail("river-rail-art", "River transfer rail", 196, 596, 336),
    spawn("river-spawn", 58),
    player("river-player", 58),
    token("river-token-1", "Bridge token one", 188, 620),
    token("river-token-2", "Bridge token two", 402, 548),
    hazard("river-hazard", "River route break", 548),
    token("river-token-3", "Deck token", 724, 504),
    token("river-token-4", "Final approach token", 946, 620),
    finishGoal(),
  ];
  return [
    {
      id: "map-plaza",
      name: "Neon Plaza",
      width: 1280,
      height: 720,
      background: PALETTE.ink,
      gravity: 1500,
      grid: 20,
      controlMode: "platformer",
      objects: plazaObjects,
      traversalPaths: [{ id: "plaza-rhythm-rail", name: "Plaza rhythm rail", kind: "grind", collisionOwner: "authored-map", points: [{ x: 262, y: 612, z: 0 }, { x: 552, y: 612, z: 0 }], entryRadius: 72, minimumEntrySpeed: 120, direction: "both", acceleration: 90, maximumSpeed: 500, exitImpulse: { x: 95, y: -260 }, bailBehavior: "launch", visualObjectId: "plaza-rail-art", acceptanceTestId: "test-plaza-rail" }],
      hudSafeAreas: [{ id: "plaza-hud", name: "Score and goal HUD", x: 0, y: 0, width: 1280, height: 78 }],
      maxInteractionGap: 330,
      interactionPolicy: { expectedSockets: 0, requiresFreshPress: true },
    },
    {
      id: "map-river",
      name: "River Arcade",
      width: 1280,
      height: 720,
      background: "#11152f",
      gravity: 1500,
      grid: 20,
      controlMode: "platformer",
      objects: riverObjects,
      traversalPaths: [{ id: "river-transfer-rail", name: "River transfer rail", kind: "grind", collisionOwner: "authored-map", points: [{ x: 210, y: 608, z: 0 }, { x: 504, y: 608, z: 0 }], entryRadius: 72, minimumEntrySpeed: 120, direction: "both", acceleration: 105, maximumSpeed: 520, exitImpulse: { x: 105, y: -275 }, bailBehavior: "launch", visualObjectId: "river-rail-art", acceptanceTestId: "test-river-rail" }],
      hudSafeAreas: [{ id: "river-hud", name: "Score and goal HUD", x: 0, y: 0, width: 1280, height: 78 }],
      maxInteractionGap: 330,
      interactionPolicy: { expectedSockets: 0, requiresFreshPress: true },
    },
  ];
}

const ACCEPTANCE_TESTS = Object.freeze([
  { id: "test-responsive-movement", name: "Responsive kinetic movement", featureId: "feature-responsive-movement", assertion: "semantic-input-feel", expected: "Run acceleration, coyote time, jump buffering, jump cut, apex gravity, and landing events are deterministic at 60 Hz." },
  { id: "test-plaza-rail", name: "Plaza rail entry and exit", featureId: "feature-plaza-route", assertion: "authored-traversal-path", expected: "Fresh E input locks to plaza-rhythm-rail; travel, exit impulse, and bail behavior use authored points only." },
  { id: "test-river-rail", name: "River rail entry and exit", featureId: "feature-river-route", assertion: "authored-traversal-path", expected: "Fresh E input locks to river-transfer-rail; travel and exit are deterministic." },
  { id: "test-map-continuity", name: "Exact connected-map handoff", featureId: "feature-map-continuity", assertion: "portal-exact-spawn", expected: "plaza-to-river enters map-river at river-spawn and cannot bounce while interaction remains held." },
  {
    id: "test-finish",
    name: "Readable final route",
    featureId: "feature-finish",
    assertion: "goal-reachable",
    expected: "The final approach has a visible token, safe recovery space, and a reachable finish trigger.",
    runner: "looplab-deterministic-runtime",
    driver: {
      startMapId: "map-river",
      startSpawnId: "river-spawn",
      tickRate: 60,
      tickCount: 200,
      inputs: [
        { tick: 0, action: "move-right", pressed: true },
        { tick: 75, action: "jump", pressed: true },
        { tick: 83, action: "jump", pressed: false },
        { tick: 199, action: "move-right", pressed: false },
      ],
    },
    assertions: [
      { id: "finish-won", target: "runtime-state", property: "won", operator: "equals", expected: true, atTick: 200 },
      { id: "finish-event", target: "event-emitted", targetId: "goal.reached", operator: "greater-or-equal", expected: 1, atTick: 200 },
    ],
  },
]);

const FEATURE_CONTRACTS = Object.freeze([
  { id: "feature-responsive-movement", name: "Responsive skating movement", visual: "kinetic-skater frames 0-3", collision: "authored swept-AABB player collider", inputAction: ["move-left", "move-right", "jump"], animationState: ["idle", "push", "air", "grind"], feedbackEvent: ["player.jumped", "player.landed"], placementRules: "bottom-center ground anchor; collider remains authored", responsiveRules: "fixed backbuffer, capped DPR, semantic touch actions", acceptanceTests: ["test-responsive-movement"] },
  { id: "feature-plaza-route", name: "Neon Plaza route", visual: ["kinetic-backdrop-plaza", "plaza-rail-art"], collision: "plaza-rhythm-rail authored control points", inputAction: "interact fresh press", animationState: "grind", feedbackEvent: ["traversal.started", "traversal.completed", "traversal.bailed"], placementRules: "preview, run-up, rail, exit impulse, and recovery are individually authored", responsiveRules: "route stays below HUD-safe band", acceptanceTests: ["test-plaza-rail"] },
  { id: "feature-river-route", name: "River Arcade route", visual: ["kinetic-backdrop-river", "river-rail-art"], collision: "river-transfer-rail authored control points", inputAction: "interact fresh press", animationState: "grind", feedbackEvent: ["traversal.started", "traversal.completed"], placementRules: "rail art is aligned but never owns traversal", responsiveRules: "wide visual bounds remain in map culling range", acceptanceTests: ["test-river-rail"] },
  { id: "feature-map-continuity", name: "Plaza to river continuity", visual: "kinetic-portal", collision: "plaza-to-river authored trigger", inputAction: "interact fresh press", animationState: "transition", feedbackEvent: ["portal.entered", "map.changed"], placementRules: "exact target map and spawn IDs; no implicit overlap transition", responsiveRules: "fade is presentation-only and removed by reduced motion", acceptanceTests: ["test-map-continuity"] },
  { id: "feature-finish", name: "Night route finish", visual: "kinetic-goal", collision: "river-finish authored trigger", inputAction: "movement", animationState: "finish", feedbackEvent: "goal.reached", placementRules: "final approach includes token, landing, and recovery space", responsiveRules: "finish landmark stays below HUD-safe band", acceptanceTests: ["test-finish"] },
]);

export function isKineticDirectedBrief(brief) {
  const prompt = String(brief?.userPrompt ?? "").toLowerCase();
  return brief?.genre === "skating-tricks" || brief?.movementTemplate === "kinetic-runner" || brief?.coreLoop === "traverse-chain-score" || /skate|rollerblad|grind|courier|momentum|parkour/.test(prompt);
}

export function canPrepareDirectedScaffold(project) {
  const maps = project?.maps ?? [];
  const assets = project?.assets ?? [];
  const primaryContracts = project?.featureContracts ?? [];
  return assets.length === 0 && maps.length <= 1 && primaryContracts.length === 0 && (project?.objects ?? []).every((object) => !object.assetId);
}

export function buildKineticCityScaffold(baseProject, designBrief) {
  const base = clone(baseProject ?? {});
  const maps = buildMaps();
  const firstMap = maps[0];
  const release = clone(base.release ?? {});
  delete release.offlineVerified;
  return {
    ...base,
    name: "Kinetic City: Night Route",
    width: firstMap.width,
    height: firstMap.height,
    background: firstMap.background,
    gravity: firstMap.gravity,
    grid: firstMap.grid,
    controlMode: firstMap.controlMode,
    projection: { type: "orthographic", tileWidth: 20, tileHeight: 20 },
    packageBudgetBytes: Math.max(2_000_000, Number(base.packageBudgetBytes ?? 0)),
    maxInteractionGap: 330,
    designBrief: clone(designBrief),
    movementTuning: {
      maxRunSpeed: 330,
      groundAcceleration: 2350,
      airAcceleration: 1350,
      groundFriction: 2850,
      jumpVelocity: 610,
      coyoteTicks: 6,
      jumpBufferTicks: 8,
      jumpCutVelocity: 250,
      apexGravityScale: 0.55,
      fallGravityScale: 1.55,
      apexThreshold: 92,
    },
    assets: buildAssets(),
    objects: clone(firstMap.objects),
    traversalPaths: clone(firstMap.traversalPaths),
    clearanceZones: [],
    hudSafeAreas: clone(firstMap.hudSafeAreas),
    interactionPolicy: clone(firstMap.interactionPolicy),
    maps,
    startMapId: firstMap.id,
    activeMapId: firstMap.id,
    acceptanceTests: clone(ACCEPTANCE_TESTS),
    featureContracts: clone(FEATURE_CONTRACTS),
    release: {
      ...release,
      externalRequests: [],
      debugMarkers: [],
      singleFile: true,
      networkFree: true,
      storageFree: true,
      runtimeBundleEmbedded: true,
      engineDelivery: "built-in-inline",
      moduleImports: [],
      assetLookupValidated: true,
    },
    scaffold: {
      id: "kinetic-city-night",
      version: KINETIC_CITY_SCAFFOLD_VERSION,
      source: "looplab-directed-scaffold",
      deterministic: true,
      providerGenerated: false,
      artDirection: clone(ART_DIRECTION),
      generatedCharacter: {
        assetId: "kinetic-skater",
        sourceSha256: KINETIC_COURIER_V2_REPORT.sha256,
        encodedBytes: KINETIC_COURIER_V2_REPORT.byteLength,
        decodedRgbaBytes: KINETIC_COURIER_V2_REPORT.decodedRgbaBytes,
        onPalette: KINETIC_COURIER_V2_REPORT.onPalette,
        anchorVariance: KINETIC_COURIER_V2_REPORT.anchorVariance,
        outlineColor: KINETIC_COURIER_V2_REPORT.outlineColor,
        removedSpeckPixels: KINETIC_COURIER_V2_REPORT.removedSpeckPixels,
      },
    },
  };
}
