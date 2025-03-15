import React from "react";
import Image from "next/image";

export const Logo = ({
  className = "",
  size = 32,
}: {
  className?: string;
  size?: number;
}) => {
  return (
    <div className={className} style={{ width: size, height: size }}>
      <Image
        src="/logo.png"
        alt="Spektra Logo"
        width={size}
        height={size}
        priority
        className="object-contain"
      />
    </div>
  );
};
