// PDF export for a stage plot, built with @react-pdf/renderer (renders real
// PDF in the Node runtime — next/og's Satori only emits PNG, so it can't back a
// print-quality document). One library draws both the positioned diagram and
// the input-list table.
//
// Deliberately plain black-on-white with a red accent: this is a document a
// house engineer prints and marks up, not a branded web page. The canvas gear
// renders as the same monochrome stage-plot symbols as the editor (ported to
// react-pdf's SVG primitives in pdfSymbol below), each with its label beneath.

import {
  Document,
  Page,
  View,
  Text,
  Svg,
  G,
  Path,
  Rect,
  Circle,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { catalogItem } from "./stagePlotCatalog.ts";
import { symbolSize } from "../components/StageSymbol.tsx";
import {
  STAGE_CANVAS_ASPECT,
  type StagePlotDetail,
} from "./stagePlots.ts";

const RED = "#b42318";
const INK = "#1a1a1a";
const MUTED = "#555555";
const LINE = "#cccccc";

// Letter portrait, 40pt margins. The diagram fills the content width at the
// shared canvas aspect ratio, so a plot prints laid out exactly as edited.
const PAGE_PAD = 40;
const CONTENT_W = 612 - PAGE_PAD * 2; // 532
const DIAGRAM_H = CONTENT_W / STAGE_CANVAS_ASPECT;
const ITEM_BOX = 92; // label-width box centered on the item's x

const styles = StyleSheet.create({
  page: { padding: PAGE_PAD, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  bandName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  plotName: { fontSize: 12, color: RED, marginTop: 2, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 8, color: MUTED, marginTop: 3 },
  sectionLabel: {
    fontSize: 8,
    color: MUTED,
    marginTop: 16,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
  },
  diagram: {
    width: CONTENT_W,
    height: DIAGRAM_H,
    borderWidth: 1,
    borderColor: INK,
    borderStyle: "solid",
    position: "relative",
  },
  item: {
    position: "absolute",
    width: ITEM_BOX,
    alignItems: "center",
  },
  itemLabel: {
    fontSize: 7,
    marginTop: 2,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
  },
  houseNote: {
    fontSize: 6,
    marginTop: 1,
    textAlign: "center",
    color: RED,
  },
  audienceBar: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 8,
    color: MUTED,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
  },
  // Input list table
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, borderBottomStyle: "solid" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, borderBottomStyle: "solid", backgroundColor: "#f4f1ea" },
  cell: { paddingVertical: 4, paddingHorizontal: 4 },
  headCell: { fontFamily: "Helvetica-Bold", fontSize: 8, color: RED },
  cCh: { width: 32 },
  cSource: { width: 200 },
  cNotes: { flex: 1 },
  empty: { fontSize: 9, color: MUTED, fontStyle: "italic", marginTop: 4 },
});

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

// Auto-frame the diagram so it hugs the placed gear instead of floating in a
// big empty stage. Works in full-canvas px: take the bounding box of item
// centers, pad enough to clear each item's symbol + centered label, clamp to
// the stage, and enforce a minimum so a 1–2 item plot doesn't shrink to
// nothing. Returns the crop origin (x0,y0) and box size (w,h); the crop keeps
// the same scale, so only the empty margin shrinks. An empty plot falls back to
// the full stage.
const FRAME_PAD = 58; // px around the gear (a centered label spans ITEM_BOX = 92)
const FRAME_MIN_W = 200;
const FRAME_MIN_H = 150;
function computeFrame(items: StagePlotDetail["items"]): {
  x0: number;
  y0: number;
  w: number;
  h: number;
} {
  if (items.length === 0) return { x0: 0, y0: 0, w: CONTENT_W, h: DIAGRAM_H };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const cx = it.x * CONTENT_W;
    const cy = it.y * DIAGRAM_H;
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    minY = Math.min(minY, cy);
    maxY = Math.max(maxY, cy);
  }
  let x0 = Math.max(0, minX - FRAME_PAD);
  let y0 = Math.max(0, minY - FRAME_PAD);
  let w = Math.min(CONTENT_W, maxX + FRAME_PAD) - x0;
  let h = Math.min(DIAGRAM_H, maxY + FRAME_PAD) - y0;
  // Enforce a minimum box, re-centering the content within it and keeping the
  // crop inside the stage.
  if (w < FRAME_MIN_W) {
    x0 = Math.max(0, Math.min(x0 - (FRAME_MIN_W - w) / 2, CONTENT_W - FRAME_MIN_W));
    w = FRAME_MIN_W;
  }
  if (h < FRAME_MIN_H) {
    y0 = Math.max(0, Math.min(y0 - (FRAME_MIN_H - h) / 2, DIAGRAM_H - FRAME_MIN_H));
    h = FRAME_MIN_H;
  }
  return { x0, y0, w, h };
}

// The editor's stage-plot symbols (components/StageSymbol.tsx), ported to
// react-pdf's SVG primitives — same shapes, drawn in ink instead of currentColor
// so the printed diagram matches what the band arranged on screen.
const solid = { fill: INK };

// Match the editor (components/StageSymbol): keep the printed stroke roughly
// constant across symbol sizes, so a big drum kit doesn't draw a much heavier
// line than a mic. Solve strokeWidth against the 24-unit viewBox for a target.
const STROKE_PT = 1.6;
const strokeWidthFor = (size: number) => (STROKE_PT * 24) / size;

function symbolPaths(type: string, strokeWidth: number) {
  const stroke = { stroke: INK, strokeWidth, fill: "none" as const };
  switch (type) {
    case "vocal_mic":
      return (
        <>
          <Circle cx={12} cy={8} r={4.2} {...stroke} />
          <Path d="M12 12.2V18" {...stroke} />
          <Path d="M8.5 18h7" {...stroke} />
        </>
      );
    case "guitar_amp":
      return (
        <>
          <Rect x={4} y={3.5} width={16} height={17} rx={1.6} {...stroke} />
          <Path d="M4 8h16" {...stroke} />
          <Circle cx={7.5} cy={5.8} r={0.7} {...solid} />
          <Circle cx={10.5} cy={5.8} r={0.7} {...solid} />
          <Circle cx={12} cy={14.5} r={3.9} {...stroke} />
          <Circle cx={12} cy={14.5} r={1} {...solid} />
        </>
      );
    case "bass_amp":
      return (
        <>
          <Rect x={4} y={3.5} width={16} height={17} rx={1.6} {...stroke} />
          <Circle cx={12} cy={11.5} r={5.6} {...stroke} />
          <Circle cx={12} cy={11.5} r={1.2} {...solid} />
          <Circle cx={12} cy={18.4} r={0.9} {...solid} />
        </>
      );
    case "acoustic_guitar":
      return (
        <>
          <Circle cx={9} cy={15} r={5} {...stroke} />
          <Circle cx={9} cy={15} r={1.6} {...stroke} />
          <Path d="M12.4 11.6L19 5" {...stroke} />
          <Path d="M17.6 3.8l2.6 2.6" {...stroke} />
        </>
      );
    case "drum_kit":
      return (
        <>
          <Circle cx={12} cy={14.5} r={4.4} {...stroke} />
          <Circle cx={6.4} cy={8.4} r={2.6} {...stroke} />
          <Circle cx={17.6} cy={8.4} r={2.6} {...stroke} />
          <Circle cx={9.4} cy={10.6} r={2} {...stroke} />
          <Circle cx={14.6} cy={10.6} r={2} {...stroke} />
          <Circle cx={5.6} cy={15.4} r={2.1} {...stroke} />
        </>
      );
    case "keys":
      return (
        <>
          <Rect x={3} y={8} width={18} height={9} rx={1} {...stroke} />
          <Path d="M7 8v9M11 8v9M15 8v9" {...stroke} />
          <Rect x={5.9} y={8} width={2.2} height={5} rx={0.4} {...solid} />
          <Rect x={9.9} y={8} width={2.2} height={5} rx={0.4} {...solid} />
          <Rect x={13.9} y={8} width={2.2} height={5} rx={0.4} {...solid} />
        </>
      );
    case "horn":
      return (
        <>
          <Path d="M5 12h11" {...stroke} />
          <Path d="M16 8.5l4 -1.6v10.2l-4 -1.6z" {...stroke} />
          <Circle cx={4} cy={12} r={1.1} {...stroke} />
          <Path d="M9 12V9M11.5 12V9M14 12V9" {...stroke} />
        </>
      );
    case "di_box":
      return (
        <>
          <Rect x={5} y={9} width={14} height={8} rx={1.2} {...stroke} />
          <Path d="M12 9V5.6" {...stroke} />
          <Circle cx={12} cy={4.4} r={1.3} {...stroke} />
          <Circle cx={8} cy={13} r={0.8} {...solid} />
          <Path d="M13.5 13h2.5" {...stroke} />
        </>
      );
    case "monitor":
      return (
        <>
          <Path d="M5 17l2 -7h10l2 7z" {...stroke} />
          <Circle cx={12} cy={13.4} r={2.7} {...stroke} />
          <Circle cx={12} cy={13.4} r={0.7} {...solid} />
        </>
      );
    case "power":
      return (
        <>
          <Rect x={4} y={4} width={16} height={16} rx={2.4} {...stroke} />
          <Path d="M12.6 6.6L8.6 12.4H11.4L10.4 17.4L15 11.4H12.2L12.6 6.6Z" {...solid} />
        </>
      );
    default:
      return (
        <>
          <Rect x={4.5} y={4.5} width={15} height={15} rx={2.6} {...stroke} />
          <Circle cx={12} cy={12} r={1.4} {...solid} />
        </>
      );
  }
}

function PdfSymbol({
  type,
  size,
  rotation,
}: {
  type: string;
  size: number;
  rotation: number;
}) {
  const sw = strokeWidthFor(size);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {rotation ? (
        <G transform={`rotate(${rotation} 12 12)`}>{symbolPaths(type, sw)}</G>
      ) : (
        symbolPaths(type, sw)
      )}
    </Svg>
  );
}

function StagePlotDoc({
  bandName,
  detail,
}: {
  bandName: string;
  detail: StagePlotDetail;
}) {
  const { plot, items, inputs } = detail;
  const frame = computeFrame(items);
  return (
    <Document title={`${bandName} — ${plot.name}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.bandName}>{bandName}</Text>
        <Text style={styles.plotName}>{plot.name}</Text>
        <Text style={styles.meta}>
          Stage plot from Twin Scene · generated {formatDate(new Date())}
        </Text>

        <Text style={styles.sectionLabel}>Stage diagram</Text>
        <View style={[styles.diagram, { width: frame.w, height: frame.h, alignSelf: "center" }]}>
          {items.map((it) => {
            const cat = catalogItem(it.item_type);
            const label = it.label?.trim() || cat.label;
            const houseNote = it.use_house && cat.houseLabel ? `${cat.houseLabel} OK` : null;
            const xlrNote = it.xlr_out && cat.xlrOut ? cat.xlrOut.note : null;
            const size = symbolSize(it.item_type) * (it.scale || 1);
            // Positions are relative to the auto-framed crop origin, so the box
            // hugs the gear (see computeFrame) rather than floating in an empty
            // stage. Scale and spacing are unchanged — only the margin shrinks.
            const left = Math.min(
              Math.max(it.x * CONTENT_W - frame.x0 - ITEM_BOX / 2, 0),
              frame.w - ITEM_BOX,
            );
            const top = Math.min(
              Math.max(it.y * DIAGRAM_H - frame.y0 - size / 2, 0),
              frame.h - size - 12,
            );
            return (
              <View key={it.id} style={[styles.item, { left, top }]}>
                <PdfSymbol type={it.item_type} size={size} rotation={it.rotation} />
                <Text style={styles.itemLabel}>{label}</Text>
                {houseNote && <Text style={styles.houseNote}>{houseNote}</Text>}
                {xlrNote && <Text style={styles.houseNote}>{xlrNote}</Text>}
              </View>
            );
          })}
        </View>
        <Text style={styles.audienceBar}>FRONT OF STAGE · AUDIENCE</Text>

        <Text style={styles.sectionLabel}>Input list</Text>
        {inputs.length === 0 ? (
          <Text style={styles.empty}>No input channels.</Text>
        ) : (
          <View>
            <View style={styles.headRow}>
              <Text style={[styles.cell, styles.headCell, styles.cSource]}>Source</Text>
              <Text style={[styles.cell, styles.headCell, styles.cNotes]}>Notes</Text>
            </View>
            {inputs.map((row) => (
              <View key={row.id} style={styles.row} wrap={false}>
                <Text style={[styles.cell, styles.cSource]}>{row.source}</Text>
                <Text style={[styles.cell, styles.cNotes]}>{row.notes ?? ""}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function renderStagePlotPdf(
  bandName: string,
  detail: StagePlotDetail,
): Promise<Buffer> {
  return renderToBuffer(<StagePlotDoc bandName={bandName} detail={detail} />);
}
