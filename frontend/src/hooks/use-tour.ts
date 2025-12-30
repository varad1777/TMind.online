// src/hooks/use-tour.ts
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { TOUR_AUTO_DELAY_MS } from "./tour_config";

export type DriveStep = {
  element?: string | Element | (() => Element);
  popover?: {
    title?: string;
    description?: string;
  };
};

export const useTour = () => {
  const startTour = (steps: DriveStep[], autoDelayMs: number = TOUR_AUTO_DELAY_MS) => {

    // ⭐ Delay so DOM elements exist (fix autoTour filtering issue)
    setTimeout(() => {

      const filteredSteps = steps.filter((step) => {
        if (!step.element) return false;

        if (typeof step.element === "string") {
          return !!document.querySelector(step.element);
        }
        if (typeof step.element === "function") {
          return !!step.element();
        }
        if (step.element instanceof Element) return true;

        return false;
      });

      if (!filteredSteps.length) return;

      const tour = driver({
        animate: true,
        showProgress: true,
        overlayOpacity: 0.6,
        steps: filteredSteps,
        allowClose: true,
      });

      tour.drive();

      // ⭐ Auto-next logic
      if (autoDelayMs > 0) {
        let index = 0;
        const interval = setInterval(() => {
          index++;
          if (index < filteredSteps.length) {
            tour.moveNext();
          } else {
            clearInterval(interval);
          }
        }, autoDelayMs);
      }

    }, 700); // ⭐ Delay ensures all DOM elements exist
  };

  return { startTour };
};
