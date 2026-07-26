import { RELEASE_VERSION } from "./releases";

export const GITHUB_REPOSITORY_URL = "https://github.com/krl-gr/upcomputer";

export const SOFTWARE_APPLICATION_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Up.computer",
  description: "A visual desktop workspace for coding-agent CLIs and the built-in Up Agent.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: ["macOS", "Windows 10", "Windows 11", "Linux"],
  softwareVersion: RELEASE_VERSION,
  url: "https://up.computer/",
  downloadUrl: "https://up.computer/download/",
  image: "https://up.computer/icon.png",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: "https://up.computer/download/",
  },
  publisher: {
    "@type": "Organization",
    name: "Up.computer",
    url: "https://up.computer/",
  },
} as const;
