"use client";

import type { WidgetType } from "@/agent/widget-schemas";
import DutyCycleCalculator from "./DutyCycleCalculator";
import PolarityDiagram from "./PolarityDiagram";
import ProcessSelector from "./ProcessSelector";
import SettingsConfigurator from "./SettingsConfigurator";
import TroubleshootingTree from "./TroubleshootingTree";

export default function WidgetRenderer({
  widget,
  props,
  onOpenPage,
}: {
  widget: WidgetType;
  props: unknown;
  onOpenPage: (p: { doc: string; page: number }) => void;
}) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  switch (widget) {
    case "duty_cycle_calculator":
      return <DutyCycleCalculator {...(props as any)} />;
    case "polarity_diagram":
      return <PolarityDiagram {...(props as any)} />;
    case "troubleshooting_tree":
      return <TroubleshootingTree {...(props as any)} onOpenPage={onOpenPage} />;
    case "settings_configurator":
      return <SettingsConfigurator {...(props as any)} />;
    case "process_selector":
      return <ProcessSelector {...(props as any)} />;
    default:
      return null;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
