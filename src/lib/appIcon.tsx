import { ImageResponse } from "next/og";

/** The app icon: a quiet serif monogram on warm white. Rendered on demand in every size. */
export function appIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f2ec",
          color: "#1a1917",
          fontFamily: "serif",
          fontSize: size * 0.5,
          letterSpacing: -size * 0.02,
        }}
      >
        W
      </div>
    ),
    { width: size, height: size },
  );
}
