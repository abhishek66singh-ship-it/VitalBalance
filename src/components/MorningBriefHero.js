import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

const { width: SCREEN_W } = Dimensions.get("window");
const CAROUSEL_W = SCREEN_W - 40;
const CARD_H = 172;
const AUTO_ADVANCE_MS = 4200;
const isWeb = Platform.OS === "web";

/**
 * MorningBriefHero
 *
 * Animated slideshow card for the Home screen hero section.
 * Uses ScrollView with pagingEnabled — no external animation libraries,
 * safe for Expo Go on iOS and Android. Includes web-only arrow buttons.
 *
 * Props:
 *   slides  — Array<{ id, icon, category, headline, body, color, accent }>
 */
export default function MorningBriefHero({ slides = [] }) {
  const scrollRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const timerRef = useRef(null);

  // Dynamically maintain the animated values array to adapt to slides length
  const dotAnimRef = useRef([]);
  if (dotAnimRef.current.length !== slides.length) {
    const prevLen = dotAnimRef.current.length;
    if (slides.length > prevLen) {
      for (let i = prevLen; i < slides.length; i++) {
        dotAnimRef.current[i] = new Animated.Value(i === activeIdx ? 1 : 0);
      }
    } else {
      dotAnimRef.current = dotAnimRef.current.slice(0, slides.length);
    }
  }
  const dotAnim = dotAnimRef.current;

  // Update dot animation when activeIdx or slides count changes
  useEffect(() => {
    dotAnim.forEach((anim, i) => {
      if (anim) {
        Animated.spring(anim, {
          toValue: i === activeIdx ? 1 : 0,
          useNativeDriver: false,
          tension: 80,
          friction: 10,
        }).start();
      }
    });
  }, [activeIdx, slides.length, dotAnim]);

  const advance = useCallback(
    (nextIdx) => {
      if (!slides.length) return;
      const idx = nextIdx !== undefined ? nextIdx : (activeIdx + 1) % slides.length;
      scrollRef.current?.scrollTo({ x: CAROUSEL_W * idx, animated: true });
      setActiveIdx(idx);
    },
    [activeIdx, slides.length]
  );

  // Auto-advance timer
  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % slides.length;
        scrollRef.current?.scrollTo({ x: CAROUSEL_W * next, animated: true });
        return next;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timerRef.current);
  }, [slides.length]);

  const handleScrollEnd = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_W);
    if (idx !== activeIdx) {
      setActiveIdx(idx);
      // Reset timer on manual swipe
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setActiveIdx((prev) => {
          const next = (prev + 1) % slides.length;
          scrollRef.current?.scrollTo({ x: CAROUSEL_W * next, animated: true });
          return next;
        });
      }, AUTO_ADVANCE_MS);
    }
  };

  const handlePrev = () => {
    if (!slides.length) return;
    clearInterval(timerRef.current);
    const prevIdx = (activeIdx - 1 + slides.length) % slides.length;
    scrollRef.current?.scrollTo({ x: CAROUSEL_W * prevIdx, animated: true });
    setActiveIdx(prevIdx);
  };

  const handleNext = () => {
    if (!slides.length) return;
    clearInterval(timerRef.current);
    const nextIdx = (activeIdx + 1) % slides.length;
    scrollRef.current?.scrollTo({ x: CAROUSEL_W * nextIdx, animated: true });
    setActiveIdx(nextIdx);
  };

  if (!slides.length) return null;

  const currentSlide = slides[activeIdx] || slides[0];

  return (
    <View style={styles.wrapper}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>✨ MORNING BRIEF</Text>
        <Text style={styles.headerCount}>
          {activeIdx + 1} / {slides.length}
        </Text>
      </View>

      {/* Slide carousel container */}
      <View style={styles.carouselContainer}>
        {isWeb && slides.length > 1 && (
          <TouchableOpacity
            style={[styles.webArrowBtn, styles.webArrowLeft]}
            onPress={handlePrev}
            activeOpacity={0.8}
          >
            <ChevronLeft size={20} color="#fff" />
          </TouchableOpacity>
        )}

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          decelerationRate="fast"
          style={styles.scrollView}
          contentContainerStyle={{ width: CAROUSEL_W * slides.length }}
        >
          {slides.map((slide, i) => (
            <SlideCard key={slide.id} slide={slide} />
          ))}
        </ScrollView>

        {isWeb && slides.length > 1 && (
          <TouchableOpacity
            style={[styles.webArrowBtn, styles.webArrowRight]}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <ChevronRight size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Dot indicators */}
      <View style={styles.dotsRow}>
        {slides.map((_, i) => {
          const dotWidth = dotAnim[i]
            ? dotAnim[i].interpolate({
                inputRange: [0, 1],
                outputRange: [6, 20],
              })
            : 6;
          const dotOpacity = dotAnim[i]
            ? dotAnim[i].interpolate({
                inputRange: [0, 1],
                outputRange: [0.35, 1],
              })
            : 0.35;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => {
                clearInterval(timerRef.current);
                advance(i);
              }}
              hitSlop={8}
            >
              <Animated.View
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    opacity: dotOpacity,
                    backgroundColor: currentSlide.accent,
                  },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function SlideCard({ slide }) {
  return (
    <View style={[styles.card, { backgroundColor: slide.color, width: CAROUSEL_W }]}>
      {/* Top row: icon + category badge */}
      <View style={styles.cardTopRow}>
        <View style={[styles.iconBubble, { backgroundColor: slide.accent + "22" }]}>
          <Text style={styles.iconEmoji}>{slide.icon}</Text>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: slide.accent + "20", borderColor: slide.accent + "40" }]}>
          <Text style={[styles.categoryText, { color: slide.accent }]}>{slide.category}</Text>
        </View>
      </View>

      {/* Content */}
      <Text style={[styles.headline, { color: slide.accent }]} numberOfLines={2}>
        {slide.headline}
      </Text>
      <Text style={styles.body} numberOfLines={4}>
        {slide.body}
      </Text>

      {/* Subtle glow accent line */}
      <View style={[styles.accentBar, { backgroundColor: slide.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginBottom: 14,
    marginTop: 2,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2F6B4F",
    letterSpacing: 0.5,
  },
  headerCount: {
    fontSize: 10,
    color: "#9C9384",
    fontWeight: "600",
  },
  carouselContainer: {
    position: "relative",
    borderRadius: 22,
    overflow: "hidden",
  },
  scrollView: {
    borderRadius: 22,
    overflow: "hidden",
  },
  card: {
    height: CARD_H,
    borderRadius: 22,
    padding: 18,
    overflow: "hidden",
    position: "relative",
    justifyContent: "flex-start",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: {
    fontSize: 20,
  },
  categoryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  headline: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Georgia",
    lineHeight: 20,
    marginBottom: 6,
  },
  body: {
    fontSize: 12,
    color: "#D8D0C4",
    lineHeight: 17,
    flex: 1,
  },
  accentBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    opacity: 0.6,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  webArrowBtn: {
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -18 }],
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  webArrowLeft: {
    left: 12,
  },
  webArrowRight: {
    right: 12,
  },
});
