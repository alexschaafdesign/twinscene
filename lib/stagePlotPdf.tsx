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
    month: "long",
    day: "numeric",
  }).format(d);
}

// The editor's stage-plot symbols (components/StageSymbol.tsx), ported to
// react-pdf's SVG primitives — same shapes, drawn in ink instead of currentColor
// so the printed diagram matches what the band arranged on screen.
const SW = 1.3;
const stroke = { stroke: INK, strokeWidth: SW, fill: "none" as const };
const solid = { fill: INK };

function symbolPaths(type: string) {
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
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {rotation ? (
        <G transform={`rotate(${rotation} 12 12)`}>{symbolPaths(type)}</G>
      ) : (
        symbolPaths(type)
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
  return (
    <Document title={`${bandName} — ${plot.name}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.bandName}>{bandName}</Text>
        <Text style={styles.plotName}>{plot.name}</Text>
        <Text style={styles.meta}>Stage plot · generated {formatDate(new Date())}</Text>

        <Text style={styles.sectionLabel}>Stage diagram</Text>
        <View style={styles.diagram}>
          {items.map((it) => {
            const cat = catalogItem(it.item_type);
            const label = it.label?.trim() || cat.label;
            const houseNote = it.use_house && cat.houseLabel ? `${cat.houseLabel} OK` : null;
            const xlrNote = it.xlr_out && cat.xlrOut ? cat.xlrOut.note : null;
            const size = symbolSize(it.item_type) * (it.scale || 1);
            const left = Math.min(
              Math.max(it.x * CONTENT_W - ITEM_BOX / 2, 0),
              CONTENT_W - ITEM_BOX,
            );
            const top = Math.min(
              Math.max(it.y * DIAGRAM_H - size / 2, 0),
              DIAGRAM_H - size - 12,
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
        <Text style={styles.audienceBar}>▲ FRONT OF STAGE · AUDIENCE ▲</Text>

        <Text style={styles.sectionLabel}>Input list</Text>
        {inputs.length === 0 ? (
          <Text style={styles.empty}>No input channels.</Text>
        ) : (
          <View>
            <View style={styles.headRow}>
              <Text style={[styles.cell, styles.headCell, styles.cCh]}>#</Text>
              <Text style={[styles.cell, styles.headCell, styles.cSource]}>Source</Text>
              <Text style={[styles.cell, styles.headCell, styles.cNotes]}>Notes</Text>
            </View>
            {inputs.map((row, i) => (
              <View key={row.id} style={styles.row} wrap={false}>
                <Text style={[styles.cell, styles.cCh]}>{row.channel_number ?? i + 1}</Text>
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
