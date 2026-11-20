import type { Metadata } from "next";
import SimulatorView from "./SimulatorView";

export const metadata: Metadata = {
  title: "What-If Simulator",
  description: "Predicted yield change under rainfall and temperature scenarios, by district and crop.",
};

export default function Page() {
  return <SimulatorView />;
}
