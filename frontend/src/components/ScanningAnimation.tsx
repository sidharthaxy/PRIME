import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface Props {
    size?: number;
    color?: string;
}

export default function ScanningAnimation({ size = 150, color = '#007AFF' }: Props) {
    const pulseAnim1 = useRef(new Animated.Value(0)).current;
    const pulseAnim2 = useRef(new Animated.Value(0)).current;
    const pulseAnim3 = useRef(new Animated.Value(0)).current;
    
    useEffect(() => {
        const createPulse = (anim: Animated.Value, delay: number) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(anim, {
                        toValue: 1,
                        duration: 3000,
                        useNativeDriver: true,
                    })
                ])
            );
        };
        
        createPulse(pulseAnim1, 0).start();
        createPulse(pulseAnim2, 1000).start();
        createPulse(pulseAnim3, 2000).start();
        
        return () => {
             pulseAnim1.stopAnimation();
             pulseAnim2.stopAnimation();
             pulseAnim3.stopAnimation();
        };
    }, []);

    const getPulseStyle = (anim: Animated.Value) => ({
        transform: [
            {
                scale: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.1, 1.2]
                })
            }
        ],
        opacity: anim.interpolate({
            inputRange: [0, 0.7, 1],
            outputRange: [0.8, 0.2, 0]
        }),
    });

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Animated.View style={[styles.circle, { backgroundColor: color, width: size, height: size, borderRadius: size / 2 }, getPulseStyle(pulseAnim1)]} />
            <Animated.View style={[styles.circle, { backgroundColor: color, width: size, height: size, borderRadius: size / 2 }, getPulseStyle(pulseAnim2)]} />
            <Animated.View style={[styles.circle, { backgroundColor: color, width: size, height: size, borderRadius: size / 2 }, getPulseStyle(pulseAnim3)]} />
            {/* Center dot */}
            <View style={[styles.centerDot, { backgroundColor: color }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 20,
    },
    circle: {
        position: 'absolute',
    },
    centerDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        position: 'absolute',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    }
});
