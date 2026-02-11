import { useQuery } from "@tanstack/react-query";
import type { ThemeConfig } from "@shared/schema";

interface ThemeApiResponse {
  themeConfig?: ThemeConfig | null;
  pointsConfig?: { enabled: boolean; name: string } | null;
  brandName?: string;
}

export function useTheme() {
  const { data } = useQuery<ThemeApiResponse>({
    queryKey: ["/api/config/theme"],
    refetchInterval: 30000,
  });

  const brandName = data?.themeConfig?.brand?.name || data?.brandName || "WILDCARD";
  const pointsName = data?.pointsConfig?.name || "WILD";
  const logoUrl = data?.themeConfig?.brand?.logoUrl;
  const logoIcon = data?.themeConfig?.brand?.logoIcon;

  return {
    brandName,
    pointsName,
    logoUrl,
    logoIcon,
    themeConfig: data?.themeConfig ?? null,
  };
}
