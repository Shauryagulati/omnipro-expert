import { z } from "zod";

const citation = z.object({ doc: z.string(), page: z.number().int() });

export const widgetSchemas = {
  duty_cycle_calculator: z.object({
    process: z.string(),
    voltage: z.enum(["120V", "240V"]),
    points: z
      .array(z.object({ amps: z.number(), dutyPct: z.number().min(0).max(100) }))
      .min(1),
    citation,
  }),
  polarity_diagram: z.object({
    process: z.string(),
    connections: z
      .array(
        z.object({
          cable: z.string().describe("e.g. 'Ground Clamp', 'TIG Torch', 'Wire Feed Power'"),
          socket: z.enum(["positive", "negative", "wire-feed"]),
        }),
      )
      .min(1),
    note: z.string().optional(),
    citation,
  }),
  troubleshooting_tree: z.object({
    title: z.string(),
    checks: z
      .array(
        z.object({
          title: z.string(),
          detail: z.string(),
          figureId: z.string().optional(),
          citation,
        }),
      )
      .min(1),
  }),
  settings_configurator: z.object({
    title: z.string(),
    rows: z
      .array(
        z.object({
          process: z.string(),
          material: z.string(),
          thickness: z.string(),
          wire: z.string().optional(),
          setting: z.string(),
        }),
      )
      .min(1),
    citation,
  }),
  process_selector: z.object({
    options: z
      .array(
        z.object({
          process: z.string(),
          skill: z.string(),
          gas: z.string(),
          materials: z.array(z.string()),
          thickness: z.string(),
          bestFor: z.string(),
        }),
      )
      .min(2),
    citation,
  }),
} as const;

export type WidgetType = keyof typeof widgetSchemas;
export const WIDGET_TYPES = Object.keys(widgetSchemas) as WidgetType[];

export type WidgetProps<T extends WidgetType> = z.infer<(typeof widgetSchemas)[T]>;
