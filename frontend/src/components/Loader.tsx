// src/components/PageLoader.tsx
import React from "react";
import { useLocation } from "react-router-dom";
type PageLoaderProps = {
  isVisible: boolean;
};

const PageLoader: React.FC<PageLoaderProps> = ({ isVisible }) => {
  const location = useLocation();

  // ❌ Do NOT show loader on forbidden / not-found cases
  const disableLoader =
    location.pathname === "/forbidden" ||
    location.pathname === "/404";

  if (!isVisible || disableLoader) return null;
  const text = "wmind.wonderbiz.org";

  return (
    <div
      aria-hidden={!isVisible}
      style={{
        position: "fixed",
        inset: 0,
        display: isVisible ? "flex" : "none",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#E3F2FD",
        zIndex: 9999,
        flexDirection: "column",
        gap: 40,
      }}
    >
      {/* Letter by letter animation */}
      <div
        style={{
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: 2,
          display: "flex",
          gap: 2,
          color: "#1976D2",
        }}
      >
        {text.split("").map((letter, i) => (
          <span
            key={i}
            style={{
              animation: `fadeInLetter 0.15s ease-out ${i * 0.04}s both`,
              opacity: 0,
            }}
          >
            {letter}
          </span>
        ))}
      </div>

      {/* Simple loading bar */}
      <div
        style={{
          width: 200,
          height: 2,
          backgroundColor: "#BBDEFB",
          overflow: "hidden",
          borderRadius: 1,
        }}
      >
        <div
          style={{
            height: "100%",
            backgroundColor: "#1976D2",
            animation: "loadingBar 0.3s ease-in-out forwards",
          }}
        />
      </div>

      <style>{`
        @keyframes fadeInLetter {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes loadingBar {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default PageLoader;
