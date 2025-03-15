"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { Slider } from "../../components/ui/Slider";
import { ColorSlider } from "../../components/ui/ColorSlider";
import { Button } from "../../components/ui/Button";
import { Logo } from "../../components/ui/Logo";
import {
  Upload,
  Save,
  Undo,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Image as ImageIcon,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdjustmentValues {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  saturation: number;
  clarity: number;
  dehaze: number;
  texture: number;
}

/*
interface CropState {
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: number | null;
}
*/

// Update the debounce function type
function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function PhotoEditor() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [adjustmentHistory, setAdjustmentHistory] = useState<
    AdjustmentValues[]
  >([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [adjustments, setAdjustments] = useState<AdjustmentValues>({
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
    saturation: 0,
    clarity: 0,
    dehaze: 0,
    texture: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    light: false,
    color: false,
    effects: false,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debouncedApplyRef = useRef<(() => void) | undefined>(undefined);

  const [showSaveDropdown, setShowSaveDropdown] = useState(false);
  /*
  const [isCropping, setIsCropping] = useState(false);
  const [cropState, setCropState] = useState<CropState>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    aspect: null,
  });
  const [originalImageSize, setOriginalImageSize] = useState({
    width: 0,
    height: 0,
  });
  const cropStartPos = useRef({ x: 0, y: 0 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  */

  const applyAdjustments = useCallback(() => {
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match container while maintaining aspect ratio
    const container = canvas.parentElement;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Set canvas size to match container
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scaled dimensions to fit the image in view
    const scale = Math.min(
      containerWidth / image.width,
      containerHeight / image.height
    );
    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;

    // Center the image
    const x = (containerWidth - scaledWidth) / 2;
    const y = (containerHeight - scaledHeight) / 2;

    // Apply zoom and pan transformation
    ctx.save();

    // Apply transformations in this order
    ctx.translate(pan.x, pan.y); // Apply pan first
    ctx.translate(x, y); // Move to center position
    ctx.scale(zoom, zoom); // Apply zoom

    // Draw the image at its original size (scaled by the initial fit-to-screen scale)
    ctx.drawImage(image, 0, 0, scaledWidth, scaledHeight);

    // Get image data for processing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Apply adjustments
    for (let i = 0; i < data.length; i += 4) {
      // Get RGB values
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Convert to HSL for initial luminance value
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [, , l] = rgbToHsl(r, g, b);

      // Apply exposure (affects brightness multiplicatively)
      const exposureFactor = Math.pow(2, adjustments.exposure / 100);
      r = Math.min(255, Math.max(0, r * exposureFactor));
      g = Math.min(255, Math.max(0, g * exposureFactor));
      b = Math.min(255, Math.max(0, b * exposureFactor));

      // Apply contrast (using improved contrast formula)
      const contrastFactor = Math.pow((adjustments.contrast + 100) / 100, 2);
      r = Math.min(255, Math.max(0, 128 + (r - 128) * contrastFactor));
      g = Math.min(255, Math.max(0, 128 + (g - 128) * contrastFactor));
      b = Math.min(255, Math.max(0, 128 + (b - 128) * contrastFactor));

      // Apply whites (affects bright areas more aggressively than highlights)
      if (l > 0.7) {
        const whitesFactor = adjustments.whites / 100;
        const whitesAdjustment = whitesFactor * (l - 0.7) * 3;
        r = Math.min(255, Math.max(0, r + (255 - r) * whitesAdjustment));
        g = Math.min(255, Math.max(0, g + (255 - g) * whitesAdjustment));
        b = Math.min(255, Math.max(0, b + (255 - b) * whitesAdjustment));
      }

      // Apply blacks (affects dark areas more aggressively than shadows)
      if (l < 0.3) {
        const blacksFactor = adjustments.blacks / 100;
        const blacksAdjustment = blacksFactor * (0.3 - l) * 3;
        r = Math.min(255, Math.max(0, r - r * blacksAdjustment));
        g = Math.min(255, Math.max(0, g - g * blacksAdjustment));
        b = Math.min(255, Math.max(0, b - b * blacksAdjustment));
      }

      // Apply highlights (affects bright areas)
      if (l > 0.5) {
        const highlightFactor = adjustments.highlights / 100;
        const highlightAdjustment = highlightFactor * (l - 0.5) * 2;
        r = Math.min(255, Math.max(0, r + (255 - r) * highlightAdjustment));
        g = Math.min(255, Math.max(0, g + (255 - g) * highlightAdjustment));
        b = Math.min(255, Math.max(0, b + (255 - b) * highlightAdjustment));
      }

      // Apply shadows (affects dark areas)
      if (l < 0.5) {
        const shadowFactor = adjustments.shadows / 100;
        const shadowAdjustment = shadowFactor * (0.5 - l) * 2;
        r = Math.min(255, Math.max(0, r + r * shadowAdjustment));
        g = Math.min(255, Math.max(0, g + g * shadowAdjustment));
        b = Math.min(255, Math.max(0, b + b * shadowAdjustment));
      }

      // Apply temperature (warm/cool)
      const tempFactor = adjustments.temperature / 100;
      if (tempFactor > 0) {
        // Warmer (more yellow/orange)
        r = Math.min(255, r + (255 - r) * tempFactor * 0.5); // Add more red
        g = Math.min(255, g + (255 - g) * tempFactor * 0.3); // Add some green
        b = Math.max(0, b - b * tempFactor * 0.2); // Reduce blue
      } else {
        // Cooler (more blue)
        const coolFactor = Math.abs(tempFactor);
        r = Math.max(0, r - r * coolFactor * 0.2); // Reduce red
        g = Math.max(0, g - g * coolFactor * 0.2); // Reduce green
        b = Math.min(255, b + (255 - b) * coolFactor * 0.5); // Add more blue
      }

      // Apply tint (green/magenta)
      const tintFactor = adjustments.tint / 100;
      if (tintFactor > 0) {
        // More magenta
        r = Math.min(255, r + (255 - r) * tintFactor * 0.4); // Add red
        g = Math.max(0, g - g * tintFactor * 0.2); // Reduce green
        b = Math.min(255, b + (255 - b) * tintFactor * 0.4); // Add blue
      } else {
        // More green
        const greenFactor = Math.abs(tintFactor);
        r = Math.max(0, r - r * greenFactor * 0.2); // Reduce red
        g = Math.min(255, g + (255 - g) * greenFactor * 0.4); // Add green
        b = Math.max(0, b - b * greenFactor * 0.2); // Reduce blue
      }

      // Apply saturation last
      const [hFinal, sFinal, lFinal] = rgbToHsl(r, g, b);
      const saturationFactor = (adjustments.saturation + 100) / 100;
      const newHsl = [
        hFinal,
        Math.min(1, Math.max(0, sFinal * saturationFactor)),
        lFinal,
      ];
      [r, g, b] = hslToRgb(newHsl[0], newHsl[1], newHsl[2]);

      // Apply clarity (sharpening/softening effect)
      if (adjustments.clarity !== 0) {
        const clarityFactor = adjustments.clarity / 100;
        const pixelX = (i / 4) % canvas.width;
        const pixelY = Math.floor(i / 4 / canvas.width);

        // Calculate gaussian blur for the current pixel
        let blurredR = 0;
        let blurredG = 0;
        let blurredB = 0;
        let totalWeight = 0;

        // 5x5 gaussian kernel for better quality
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const sx = Math.min(Math.max(pixelX + dx, 0), canvas.width - 1);
            const sy = Math.min(Math.max(pixelY + dy, 0), canvas.height - 1);
            const sampleIndex = (sy * canvas.width + sx) * 4;

            // Gaussian weight based on distance
            const distance = Math.sqrt(dx * dx + dy * dy);
            const weight = Math.exp(-(distance * distance) / 4.0);
            totalWeight += weight;

            blurredR += data[sampleIndex] * weight;
            blurredG += data[sampleIndex + 1] * weight;
            blurredB += data[sampleIndex + 2] * weight;
          }
        }

        // Normalize blurred values
        blurredR /= totalWeight;
        blurredG /= totalWeight;
        blurredB /= totalWeight;

        if (clarityFactor > 0) {
          // Sharpening: Add scaled difference between original and blurred
          const sharpStrength = clarityFactor * 2; // Increase effect for more noticeable sharpening
          r = Math.min(255, Math.max(0, r + (r - blurredR) * sharpStrength));
          g = Math.min(255, Math.max(0, g + (g - blurredG) * sharpStrength));
          b = Math.min(255, Math.max(0, b + (b - blurredB) * sharpStrength));
        } else {
          // Softening: Blend between original and blurred
          const softStrength = Math.abs(clarityFactor);
          r = Math.min(
            255,
            Math.max(0, r * (1 - softStrength) + blurredR * softStrength)
          );
          g = Math.min(
            255,
            Math.max(0, g * (1 - softStrength) + blurredG * softStrength)
          );
          b = Math.min(
            255,
            Math.max(0, b * (1 - softStrength) + blurredB * softStrength)
          );
        }
      }

      // Apply dehaze (increase contrast and saturation in darker areas)
      if (adjustments.dehaze !== 0) {
        const dehazeFactor = adjustments.dehaze / 100;
        if (l < 0.5) {
          const dehazeStrength = (0.5 - l) * dehazeFactor;
          r = Math.min(255, Math.max(0, r + (255 - r) * dehazeStrength));
          g = Math.min(255, Math.max(0, g + (255 - g) * dehazeStrength));
          b = Math.min(255, Math.max(0, b + (255 - b) * dehazeStrength));
        }
      }

      // Apply texture (high-frequency detail enhancement)
      if (adjustments.texture !== 0) {
        const textureFactor = adjustments.texture / 100;
        const pixelX = (i / 4) % canvas.width;
        const pixelY = Math.floor(i / 4 / canvas.width);

        // Calculate high-frequency details using a high-pass filter
        let highFreqR = 0;
        let highFreqG = 0;
        let highFreqB = 0;
        let weight = 0;

        // Sample a 3x3 grid for high-frequency details
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue; // Skip center pixel

            const sx = Math.min(Math.max(pixelX + dx, 0), canvas.width - 1);
            const sy = Math.min(Math.max(pixelY + dy, 0), canvas.height - 1);
            const sampleIndex = (sy * canvas.width + sx) * 4;

            // Calculate weight based on distance
            const w = 1 / Math.sqrt(dx * dx + dy * dy);
            weight += w;

            // Accumulate weighted differences
            highFreqR += (r - data[sampleIndex]) * w;
            highFreqG += (g - data[sampleIndex + 1]) * w;
            highFreqB += (b - data[sampleIndex + 2]) * w;
          }
        }

        // Normalize high-frequency components
        highFreqR /= weight;
        highFreqG /= weight;
        highFreqB /= weight;

        // Apply texture effect
        if (textureFactor > 0) {
          // Enhance texture
          r = Math.min(255, Math.max(0, r + highFreqR * textureFactor));
          g = Math.min(255, Math.max(0, g + highFreqG * textureFactor));
          b = Math.min(255, Math.max(0, b + highFreqB * textureFactor));
        } else {
          // Smooth texture
          r = Math.min(
            255,
            Math.max(0, r - highFreqR * Math.abs(textureFactor))
          );
          g = Math.min(
            255,
            Math.max(0, g - highFreqG * Math.abs(textureFactor))
          );
          b = Math.min(
            255,
            Math.max(0, b - highFreqB * Math.abs(textureFactor))
          );
        }
      }

      // Final clamp
      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }

    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
  }, [image, adjustments, zoom, pan, canvasRef]);

  // Initialize debounced function
  useEffect(() => {
    debouncedApplyRef.current = debounce(() => {
      if (!isProcessing) {
        setIsProcessing(true);
        applyAdjustments();
        setIsProcessing(false);
      }
    }, 16); // Approximately 60fps
  }, [isProcessing, applyAdjustments]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setImage(img);
          /*
          setOriginalImageSize({ width: img.width, height: img.height });
          setCropState({
            x: 0,
            y: 0,
            width: img.width,
            height: img.height,
            aspect: null,
          });
          */
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (image) {
      applyAdjustments();
    }
  }, [image, adjustments, zoom, pan, applyAdjustments]);

  const handleAdjustmentChange = (
    type: keyof AdjustmentValues,
    value: number
  ) => {
    // Update state immediately for smooth UI
    const newAdjustments = { ...adjustments, [type]: value };
    setAdjustments(newAdjustments);

    // Debounce the heavy image processing
    debouncedApplyRef.current?.();

    // Add to history (debounced)
    const addToHistory = debounce(() => {
      const newHistory = adjustmentHistory.slice(0, currentHistoryIndex + 1);
      newHistory.push(newAdjustments);
      setAdjustmentHistory(newHistory);
      setCurrentHistoryIndex(newHistory.length - 1);
    }, 500);
    addToHistory();
  };

  const handleResetAdjustment = (type: keyof AdjustmentValues) => {
    const newAdjustments = { ...adjustments, [type]: 0 };
    setAdjustments(newAdjustments);

    // Add to history
    const newHistory = adjustmentHistory.slice(0, currentHistoryIndex + 1);
    newHistory.push(newAdjustments);
    setAdjustmentHistory(newHistory);
    setCurrentHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (currentHistoryIndex > 0) {
      const previousIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(previousIndex);
      setAdjustments(adjustmentHistory[previousIndex]);
    }
  };

  const handleReset = () => {
    const resetValues: AdjustmentValues = {
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      temperature: 0,
      tint: 0,
      saturation: 0,
      clarity: 0,
      dehaze: 0,
      texture: 0,
    };
    setAdjustments(resetValues);

    // Add reset to history
    const newHistory = adjustmentHistory.slice(0, currentHistoryIndex + 1);
    newHistory.push(resetValues);
    setAdjustmentHistory(newHistory);
    setCurrentHistoryIndex(newHistory.length - 1);
  };

  // Add zoom handler
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Get mouse position relative to canvas
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.1), 10);

    // Calculate the position where we're zooming
    const zoomPoint = {
      x: mouseX,
      y: mouseY,
    };

    // Calculate new pan position
    const newPan = {
      x: pan.x + (zoomPoint.x - pan.x) * (1 - zoomFactor),
      y: pan.y + (zoomPoint.y - pan.y) * (1 - zoomFactor),
    };

    setZoom(newZoom);
    setPan(newPan);
  };

  // Add pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current) return;

    const newPan = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };

    setPan(newPan);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Update useEffect for window resize handling
  useEffect(() => {
    const handleResize = () => {
      if (image) {
        applyAdjustments();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [image, applyAdjustments]);

  const toggleSection = (section: "light" | "color" | "effects") => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleSaveImage = (format: "image/png" | "image/jpeg") => {
    if (!canvasRef.current || !image) return;

    // Create a temporary canvas to draw the final image
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    // Set the canvas size to match the original image size
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;

    // Apply all adjustments to the temporary canvas
    tempCtx.drawImage(image, 0, 0, image.width, image.height);

    // Get image data and apply adjustments
    const imageData = tempCtx.getImageData(
      0,
      0,
      tempCanvas.width,
      tempCanvas.height
    );
    const data = imageData.data;

    // Apply all adjustments to the image data
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Convert to HSL for initial luminance value
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [, , l] = rgbToHsl(r, g, b);

      // Apply all adjustments in the same order as the preview
      // Exposure
      const exposureFactor = Math.pow(2, adjustments.exposure / 100);
      r = Math.min(255, Math.max(0, r * exposureFactor));
      g = Math.min(255, Math.max(0, g * exposureFactor));
      b = Math.min(255, Math.max(0, b * exposureFactor));

      // Final clamp
      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }

    tempCtx.putImageData(imageData, 0, 0);

    // Create download link
    const link = document.createElement("a");
    const extension = format === "image/png" ? "png" : "jpg";
    link.download = `edited-image.${extension}`;

    // For JPEG, we can specify quality
    const quality = format === "image/jpeg" ? 0.92 : 1;
    link.href = tempCanvas.toDataURL(format, quality);

    link.click();
    setShowSaveDropdown(false);
  };

  // Add theme toggle handler
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
  };

  // Initialize theme on mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (mounted) {
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [theme, mounted]);

  if (!mounted) {
    return null; // or a loading state
  }

  return (
    <div
      className={cn(
        "flex flex-col h-screen text-gray-900 dark:text-white",
        theme === "dark" ? "bg-gray-900" : "bg-gray-50"
      )}
    >
      {/* Navbar */}
      <div
        className={cn(
          "h-14 border-b flex items-center px-4",
          theme === "dark"
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        )}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <Logo size={48} className="text-gray-800 dark:text-gray-200" />
            <span className="text-xl font-semibold">Spektra</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="ml-auto"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5 text-yellow-500" />
            ) : (
              <Moon className="h-5 w-5 text-blue-500" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Left Sidebar - Tools */}
        <div
          className={cn(
            "w-16 p-4 flex flex-col gap-4",
            theme === "dark" ? "bg-gray-800" : "bg-gray-100"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-6 w-6" />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleImageUpload}
          />
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSaveDropdown(!showSaveDropdown)}
              disabled={!image}
            >
              <Save className="h-6 w-6" />
            </Button>
            {showSaveDropdown && (
              <div
                className={cn(
                  "absolute left-full ml-2 top-0 rounded-md shadow-lg overflow-hidden",
                  theme === "dark" ? "bg-gray-700" : "bg-white"
                )}
              >
                <button
                  className={cn(
                    "w-full px-4 py-2 text-sm text-left flex items-center gap-2",
                    theme === "dark"
                      ? "text-white hover:bg-gray-600"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                  onClick={() => handleSaveImage("image/png")}
                >
                  <ImageIcon className="h-4 w-4" />
                  Save as PNG
                </button>
                <button
                  className={cn(
                    "w-full px-4 py-2 text-sm text-left flex items-center gap-2",
                    theme === "dark"
                      ? "text-white hover:bg-gray-600"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                  onClick={() => handleSaveImage("image/jpeg")}
                >
                  <ImageIcon className="h-4 w-4" />
                  Save as JPEG
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Editing Area */}
        <div className="flex-1 flex items-center justify-center overflow-hidden relative">
          <canvas
            ref={canvasRef}
            className={cn(
              "max-w-full max-h-full",
              !image && "hidden",
              isDragging && "cursor-grabbing",
              !isDragging && "cursor-grab"
              // isCropping && "cursor-crosshair"
            )}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {/* Commenting out crop overlay
          {isCropping && image && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                clipPath: `path('M 0,0 L 100%,0 L 100%,100% L 0,100% L 0,0 Z M ${(
                  (cropState.x / image.width) *
                  100
                ).toFixed(2)}%,${((cropState.y / image.height) * 100).toFixed(
                  2
                )}% L ${(
                  ((cropState.x + cropState.width) / image.width) *
                  100
                ).toFixed(2)}%,${((cropState.y / image.height) * 100).toFixed(
                  2
                )}% L ${(
                  ((cropState.x + cropState.width) / image.width) *
                  100
                ).toFixed(2)}%,${(
                  ((cropState.y + cropState.height) / image.height) *
                  100
                ).toFixed(2)}% L ${((cropState.x / image.width) * 100).toFixed(
                  2
                )}%,${(
                  ((cropState.y + cropState.height) / image.height) *
                  100
                ).toFixed(2)}% Z')`,
              }}
            >
              <div
                className="absolute border-2 border-white pointer-events-none"
                style={{
                  left: `${((cropState.x / image.width) * 100).toFixed(2)}%`,
                  top: `${((cropState.y / image.height) * 100).toFixed(2)}%`,
                  width: `${((cropState.width / image.width) * 100).toFixed(
                    2
                  )}%`,
                  height: `${((cropState.height / image.height) * 100).toFixed(
                    2
                  )}%`,
                }}
              />
            </div>
          )}
          */}
          {!image && (
            <div className="text-center">
              <p className="text-gray-400 mb-4">No image selected</p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload Image
              </Button>
            </div>
          )}
        </div>

        {/* Right Sidebar - Adjustments */}
        <div
          className={cn(
            "flex flex-col h-[calc(100vh-3.5rem)] transition-all duration-300 ease-in-out relative",
            isSidebarCollapsed ? "w-0" : "w-80",
            theme === "dark" ? "bg-gray-800" : "bg-gray-100"
          )}
        >
          {/* Collapse Toggle Button */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={cn(
              "absolute -left-6 top-1/2 -translate-y-1/2 p-1 rounded-l-md border-l border-t border-b transition-all duration-300 ease-in-out z-50",
              theme === "dark"
                ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                : "bg-gray-100 border-gray-300 hover:bg-gray-200"
            )}
          >
            {isSidebarCollapsed ? (
              <ChevronLeft
                className={cn(
                  "h-4 w-4",
                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                )}
              />
            ) : (
              <ChevronRight
                className={cn(
                  "h-4 w-4",
                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                )}
              />
            )}
          </button>

          <div
            className={cn(
              "flex-1 flex flex-col overflow-hidden transition-all duration-300",
              isSidebarCollapsed ? "opacity-0 w-0" : "opacity-100 w-full"
            )}
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold">Adjustments</h2>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="space-y-6">
                {/* Commenting out Crop Section
                <div className="mb-6 border-b border-gray-700 pb-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CropIcon className="h-5 w-5" />
                        <span className="font-medium">Crop</span>
                      </div>
                      <div className="flex gap-2">
                        {isCropping ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleApplyCrop}
                              className="text-green-500 hover:text-green-400"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelCrop}
                              className="text-red-500 hover:text-red-400"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleResetCrop}
                              className="text-gray-400 hover:text-gray-300"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleStartCrop}
                              disabled={!image}
                            >
                              Start Crop
                            </Button>
                            {image &&
                              originalImageSize.width !== image.width && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleResetCrop}
                                  className="text-gray-400 hover:text-gray-300"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAspectRatio(null)}
                        className={cn(
                          "text-xs",
                          !isCropping && "opacity-50 cursor-not-allowed",
                          cropState.aspect === null && "bg-gray-700"
                        )}
                        disabled={!isCropping}
                      >
                        Free
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAspectRatio(1)}
                        className={cn(
                          "text-xs",
                          !isCropping && "opacity-50 cursor-not-allowed",
                          cropState.aspect === 1 && "bg-gray-700"
                        )}
                        disabled={!isCropping}
                      >
                        1:1
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAspectRatio(4 / 3)}
                        className={cn(
                          "text-xs",
                          !isCropping && "opacity-50 cursor-not-allowed",
                          cropState.aspect === 4 / 3 && "bg-gray-700"
                        )}
                        disabled={!isCropping}
                      >
                        4:3
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAspectRatio(16 / 9)}
                        className={cn(
                          "text-xs",
                          !isCropping && "opacity-50 cursor-not-allowed",
                          cropState.aspect === 16 / 9 && "bg-gray-700"
                        )}
                        disabled={!isCropping}
                      >
                        16:9
                      </Button>
                    </div>
                  </div>
                </div>
                */}

                {/* Light Section */}
                <div className="space-y-4">
                  <button
                    onClick={() => toggleSection("light")}
                    className={cn(
                      "w-full flex items-center justify-between text-sm font-medium border-b pb-1",
                      theme === "dark"
                        ? "text-gray-200 border-gray-700 hover:text-white"
                        : "text-gray-700 border-gray-200 hover:text-gray-900"
                    )}
                  >
                    <h3>Light</h3>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        collapsedSections.light ? "-rotate-90" : "",
                        theme === "dark" ? "text-gray-400" : "text-gray-600"
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "space-y-2 transition-all duration-200 origin-top",
                      collapsedSections.light ? "hidden" : "block"
                    )}
                  >
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Exposure
                      </label>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.exposure]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("exposure", value[0])
                        }
                        onReset={() => handleResetAdjustment("exposure")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Contrast
                      </label>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.contrast]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("contrast", value[0])
                        }
                        onReset={() => handleResetAdjustment("contrast")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Highlights
                      </label>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.highlights]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("highlights", value[0])
                        }
                        onReset={() => handleResetAdjustment("highlights")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Shadows
                      </label>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.shadows]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("shadows", value[0])
                        }
                        onReset={() => handleResetAdjustment("shadows")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Whites
                      </label>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.whites]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("whites", value[0])
                        }
                        onReset={() => handleResetAdjustment("whites")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Blacks
                      </label>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.blacks]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("blacks", value[0])
                        }
                        onReset={() => handleResetAdjustment("blacks")}
                      />
                    </div>
                  </div>
                </div>

                {/* Color Section */}
                <div className="space-y-4">
                  <button
                    onClick={() => toggleSection("color")}
                    className={cn(
                      "w-full flex items-center justify-between text-sm font-medium border-b pb-1",
                      theme === "dark"
                        ? "text-gray-200 border-gray-700 hover:text-white"
                        : "text-gray-700 border-gray-200 hover:text-gray-900"
                    )}
                  >
                    <h3>Color</h3>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        collapsedSections.color ? "-rotate-90" : "",
                        theme === "dark" ? "text-gray-400" : "text-gray-600"
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "space-y-2 transition-all duration-200 origin-top",
                      collapsedSections.color ? "hidden" : "block"
                    )}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium">
                          Temperature
                        </label>
                        <span className="text-xs text-gray-400">
                          {adjustments.temperature}
                        </span>
                      </div>
                      <ColorSlider
                        type="temperature"
                        min={-100}
                        max={100}
                        value={[adjustments.temperature]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("temperature", value[0])
                        }
                        onReset={() => handleResetAdjustment("temperature")}
                        className="temperature-slider"
                      />
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Blue</span>
                        <span>Yellow</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium">
                          Tint
                        </label>
                        <span className="text-xs text-gray-400">
                          {adjustments.tint}
                        </span>
                      </div>
                      <ColorSlider
                        type="tint"
                        min={-100}
                        max={100}
                        value={[adjustments.tint]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("tint", value[0])
                        }
                        onReset={() => handleResetAdjustment("tint")}
                        className="tint-slider"
                      />
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Green</span>
                        <span>Magenta</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Saturation
                      </label>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.saturation]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("saturation", value[0])
                        }
                        onReset={() => handleResetAdjustment("saturation")}
                      />
                    </div>
                  </div>
                </div>

                {/* Effects Section */}
                <div className="space-y-4">
                  <button
                    onClick={() => toggleSection("effects")}
                    className={cn(
                      "w-full flex items-center justify-between text-sm font-medium border-b pb-1",
                      theme === "dark"
                        ? "text-gray-200 border-gray-700 hover:text-white"
                        : "text-gray-700 border-gray-200 hover:text-gray-900"
                    )}
                  >
                    <h3>Effects</h3>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        collapsedSections.effects ? "-rotate-90" : "",
                        theme === "dark" ? "text-gray-400" : "text-gray-600"
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "space-y-2 transition-all duration-200 origin-top",
                      collapsedSections.effects ? "hidden" : "block"
                    )}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium">
                          Clarity
                        </label>
                        <span className="text-xs text-gray-400">
                          {adjustments.clarity}
                        </span>
                      </div>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.clarity]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("clarity", value[0])
                        }
                        onReset={() => handleResetAdjustment("clarity")}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium">
                          Dehaze
                        </label>
                        <span className="text-xs text-gray-400">
                          {adjustments.dehaze}
                        </span>
                      </div>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.dehaze]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("dehaze", value[0])
                        }
                        onReset={() => handleResetAdjustment("dehaze")}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium">
                          Texture
                        </label>
                        <span className="text-xs text-gray-400">
                          {adjustments.texture}
                        </span>
                      </div>
                      <Slider
                        min={-100}
                        max={100}
                        value={[adjustments.texture]}
                        onValueChange={(value: number[]) =>
                          handleAdjustmentChange("texture", value[0])
                        }
                        onReset={() => handleResetAdjustment("texture")}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Bottom Actions */}
            <div
              className={cn(
                "p-3 border-t flex justify-between items-center",
                theme === "dark"
                  ? "bg-gray-800 border-gray-700"
                  : "bg-gray-100 border-gray-200"
              )}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                disabled={currentHistoryIndex <= 0}
                className={cn(
                  "flex items-center gap-2 disabled:opacity-50",
                  theme === "dark"
                    ? "text-gray-400 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                <Undo className="h-4 w-4" />
                <span>Undo</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className={cn(
                  "flex items-center gap-2",
                  theme === "dark"
                    ? "text-gray-400 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset All</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to convert RGB to HSL
const rgbToHsl = (
  r: number,
  g: number,
  b: number
): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return [h, s, l];
};

// Helper function to convert HSL to RGB
const hslToRgb = (
  h: number,
  s: number,
  l: number
): [number, number, number] => {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r * 255, g * 255, b * 255];
};
