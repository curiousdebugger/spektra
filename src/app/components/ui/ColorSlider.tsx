"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";
import styles from "./ColorSlider.module.css";

interface ColorSliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  type: "temperature" | "tint";
  onReset?: () => void;
}

export function ColorSlider({
  type,
  className,
  onReset,
  ...props
}: ColorSliderProps) {
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onReset?.();
  };

  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      onDoubleClick={handleDoubleClick}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative w-full grow overflow-hidden rounded-full",
          type === "temperature" ? styles.temperatureTrack : styles.tintTrack
        )}
      >
        <SliderPrimitive.Range className="absolute h-full bg-transparent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className={styles.thumb} />
    </SliderPrimitive.Root>
  );
}
