import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadNotoJp } from "@remotion/google-fonts/NotoSansJP";
import { loadFont as loadNotoBn } from "@remotion/google-fonts/NotoSansBengali";

const { fontFamily: montserratFamily } = loadMontserrat("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

const { fontFamily: notoJpFamily } = loadNotoJp("normal", {
  weights: ["700", "900"],
  ignoreTooManyRequestsWarning: true,
});

const { fontFamily: notoBnFamily } = loadNotoBn("normal", {
  weights: ["700", "900"],
  ignoreTooManyRequestsWarning: true,
});

export const fonts = {
  en: montserratFamily,
  jp: notoJpFamily,
  bn: notoBnFamily,
  stack: `${montserratFamily}, ${notoJpFamily}, ${notoBnFamily}, system-ui, sans-serif`,
};
