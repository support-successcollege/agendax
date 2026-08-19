import { motion, useScroll, useSpring } from "framer-motion";

/**
 * A thin reading-progress bar riding the very top of the viewport — the brand
 * hairline, filling as you read. Scroll-linked (it mirrors a position, it does
 * not animate on its own), with a light spring so fast flicks don't strobe.
 * RTL: progress grows from the right, the reading direction.
 */
const ReadingProgress = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

  return (
    <motion.div
      className="fixed top-0 inset-x-0 h-0.5 z-[60] bg-gradient-brand shadow-glow"
      style={{ scaleX, transformOrigin: "100%" }}
      aria-hidden="true"
    />
  );
};

export default ReadingProgress;
