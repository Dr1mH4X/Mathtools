import type { PresetExample } from "./types";

// ===================================================================
// Preset Examples
//
// Pre-configured revolution volume examples for the UI.
// Extracted from mathEngine.ts to keep data separate from logic.
// ===================================================================

export const presetExamples: PresetExample[] = [
  {
    nameKey: "revolution.help.example1Name",
    descKey: "revolution.help.example1Desc",
    curves: [
      {
        id: "1",
        type: "y_of_x",
        expression: "x^2",
        equation: "y = x^2",
        color: "#4f6ef7",
      },
      {
        id: "2",
        type: "y_const",
        expression: "4",
        equation: "y = 4",
        color: "#e74c8b",
      },
    ],
    xMin: -2,
    xMax: 2,
    axis: "x",
    axisValue: 0,
  },
  {
    nameKey: "revolution.help.example2Name",
    descKey: "revolution.help.example2Desc",
    curves: [
      {
        id: "1",
        type: "y_of_x",
        expression: "sin(x)",
        equation: "y = sin(x)",
        color: "#4f6ef7",
      },
      {
        id: "2",
        type: "y_const",
        expression: "0",
        equation: "y = 0",
        color: "#e74c8b",
      },
    ],
    xMin: 0,
    xMax: 3.14159,
    axis: "x",
    axisValue: 0,
  },
  {
    nameKey: "revolution.help.example3Name",
    descKey: "revolution.help.example3Desc",
    curves: [
      {
        id: "1",
        type: "y_of_x",
        expression: "x",
        equation: "y = x",
        color: "#4f6ef7",
      },
      {
        id: "2",
        type: "y_of_x",
        expression: "x^2",
        equation: "y = x^2",
        color: "#e74c8b",
      },
    ],
    xMin: 0,
    xMax: 1,
    axis: "y",
    axisValue: 0,
  },
];
