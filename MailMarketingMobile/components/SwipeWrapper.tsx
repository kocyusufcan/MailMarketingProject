import React from 'react';
import { Dimensions } from 'react-native';
import { PanGestureHandler, PanGestureHandlerGestureEvent, State } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    runOnJS,
} from 'react-native-reanimated';

interface SwipeWrapperProps {
    children: React.ReactNode;
    leftTarget?: string;  // Sola kaydırınca (parmak sağdan sola) gidilecek rota
    rightTarget?: string; // Sağa kaydırınca (parmak soldan sağa) gidilecek rota
}

const { width } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.35;

const SwipeWrapper: React.FC<SwipeWrapperProps> = ({ children, leftTarget, rightTarget }) => {
    const router = useRouter();
    const translateX = useSharedValue(0);

    const navigate = (target: string) => {
        translateX.value = 0; // Reset before navigation to prevent residual state
        router.navigate(target as any);
    };

    const onGestureEvent = (event: PanGestureHandlerGestureEvent) => {
        const { translationX, state } = event.nativeEvent;

        if (state === State.ACTIVE) {
            // Sadece hedeflenen yönlerde kaydırmaya izin ver, max yarı ekran kadar
            if (translationX < 0 && leftTarget) {
                translateX.value = Math.max(translationX, -width * 0.4);
            } else if (translationX > 0 && rightTarget) {
                translateX.value = Math.min(translationX, width * 0.4);
            }
        } else if (state === State.END || state === State.CANCELLED) {
            if (translationX < -SWIPE_THRESHOLD && leftTarget) {
                // Sola kaydırma başarılı - hızlıca dışarı çık, sonra sayfa değiştir
                translateX.value = withSpring(-width * 0.4, { damping: 25, stiffness: 200 }, () => {
                    runOnJS(navigate)(leftTarget);
                });
            } else if (translationX > SWIPE_THRESHOLD && rightTarget) {
                // Sağa kaydırma başarılı
                translateX.value = withSpring(width * 0.4, { damping: 25, stiffness: 200 }, () => {
                    runOnJS(navigate)(rightTarget);
                });
            } else {
                // İptal veya yetersiz kaydırma -> Yerine geri dön
                translateX.value = withSpring(0, { damping: 18, stiffness: 150 });
            }
        }
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translateX.value }],
            // Siyah arka plan GÖRMEMEK için opacity kaldırıldı
            backgroundColor: '#f1f5f9', // Ekranın arka planını koru
        };
    });

    return (
        <PanGestureHandler
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onGestureEvent}
            activeOffsetX={[-20, 20]}
            failOffsetY={[-30, 30]}
        >
            <Animated.View style={[{ flex: 1 }, animatedStyle]}>
                {children}
            </Animated.View>
        </PanGestureHandler>
    );
};

export default SwipeWrapper;
