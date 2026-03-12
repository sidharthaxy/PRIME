import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, TouchableOpacity, ImageBackground, Platform, ActivityIndicator, Dimensions } from 'react-native';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import { router } from 'expo-router';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Configure Google Sign-In for native platforms securely using the .env variable
if (Platform.OS !== 'web') {
    GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_WEB_CLIENT_ID,
    });
}

// Using a placeholder background image indicating energy consumption/billing
const BACKGROUND_IMAGE = { uri: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?q=80&w=2574&auto=format&fit=crop' };

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';
const cardWidth = isWeb ? 400 : width * 0.9;

export default function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);

    const handleAuth = async () => {
        if (!email || !password) {
            Alert.alert("Input Error", "Please enter both email and password.");
            return;
        }

        setLoading(true);
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
                router.replace('/dashboard');
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
                router.replace('/dashboard');
            }
        } catch (error) {
            // Proper TypeScript type narrowing
            if (error instanceof Error) {
                Alert.alert("Authentication Error", error.message);
            } else {
                Alert.alert("Authentication Error", String(error));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        if (Platform.OS === 'web') {
            try {
                const provider = new GoogleAuthProvider();
                await signInWithPopup(auth, provider);
                router.replace('/dashboard');
            } catch (error) {
                if (error instanceof Error) {
                    Alert.alert("Google Sign-In Error", error.message);
                    console.error(error);
                } else {
                    Alert.alert("Google Sign-In Error", String(error));
                }
            }
        } else {
            // Updated Native Google Sign-In Logic for v11+ API
            try {
                setLoading(true);
                await GoogleSignin.hasPlayServices();
                const response = await GoogleSignin.signIn();
                
                // 1. Tell TypeScript we are only grabbing data on a successful login
                if (response.type === 'success') {
                    // 2. The idToken is now nested inside the 'data' object
                    const idToken = response.data.idToken;

                    if (!idToken) {
                        throw new Error("No ID token found from Google.");
                    }

                    const credential = GoogleAuthProvider.credential(idToken);
                    await signInWithCredential(auth, credential);
                    
                    router.replace('/dashboard');
                    
                } else if (response.type === 'cancelled') {
                    // 3. User closed the modal safely. We don't need to throw an error here.
                    console.log("User cancelled Google Sign-In");
                }
                
            } catch (error) {
                if (error instanceof Error) {
                    Alert.alert("Google Sign-In Error", error.message);
                    console.error(error);
                } else {
                    Alert.alert("Google Sign-In Error", String(error));
                }
            } finally {
                setLoading(false);
            }
        }
    };

    const handleAppleLogin = async () => {
        if (Platform.OS === 'web') {
            try {
                const provider = new OAuthProvider('apple.com');
                await signInWithPopup(auth, provider);
                router.replace('/dashboard');
            } catch (error) {
                if (error instanceof Error) {
                    Alert.alert("Apple Sign-In Error", error.message);
                    console.error(error);
                } else {
                    Alert.alert("Apple Sign-In Error", String(error));
                }
            }
        } else {
            Alert.alert("Configuration Needed", "Native Apple Sign-In requires Apple Developer setup.");
        }
    };

    return (
        <View style={styles.container}>
            <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} blurRadius={isWeb ? 0 : 4}>
                <View style={styles.overlay}>
                    <View style={styles.card}>

                        <View style={styles.headerContainer}>
                            <MaterialCommunityIcons name="lightning-bolt" size={40} color="#007AFF" style={styles.logoIcon} />
                            <Text style={styles.logoText}>EnergyGuardian</Text>
                        </View>

                        <Text style={styles.subtitle}>{isLogin ? 'Sign in to access your dashboard' : 'Create an account to track your energy'}</Text>

                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Email Address</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="name@example.com"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                placeholderTextColor="#999"
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Password</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="••••••••"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                                placeholderTextColor="#999"
                            />
                        </View>

                        <TouchableOpacity style={styles.primaryButton} onPress={handleAuth} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{isLogin ? 'Sign In' : 'Register'}</Text>}
                        </TouchableOpacity>

                        <View style={styles.dividerContainer}>
                            <View style={styles.divider} />
                            <Text style={styles.dividerText}>or continue with</Text>
                            <View style={styles.divider} />
                        </View>

                        <View style={styles.socialContainer}>
                            <TouchableOpacity style={styles.socialButton} onPress={handleGoogleLogin}>
                                <FontAwesome5 name="google" size={18} color="#DB4437" />
                                <Text style={styles.socialButtonText}>Google</Text>
                            </TouchableOpacity>

                            {Platform.OS !== 'android' && (
                                <TouchableOpacity style={[styles.socialButton, styles.appleButton]} onPress={handleAppleLogin}>
                                    <FontAwesome5 name="apple" size={20} color="#fff" />
                                    <Text style={[styles.socialButtonText, styles.appleButtonText]}>Apple</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchContainer}>
                            <Text style={styles.switchText}>
                                {isLogin ? "Don't have an account? " : "Already have an account? "}
                                <Text style={styles.switchTextBold}>{isLogin ? "Sign Up" : "Sign In"}</Text>
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ImageBackground>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    overlay: {
        flex: 1,
        backgroundColor: Platform.OS === 'web' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0,0,0,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: cardWidth,
        maxWidth: 500,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 40,
        paddingTop: 48,
        elevation: 10,
        boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.2)',
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    logoIcon: {
        marginRight: 8,
    },
    logoText: {
        fontSize: 28,
        fontWeight: '800',
        color: '#1c1c1e',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        color: '#6c6c70',
        textAlign: 'center',
        marginBottom: 32,
    },
    inputContainer: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#3a3a3c',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: '#f2f2f7',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 10,
        fontSize: 16,
        color: '#1c1c1e',
        borderWidth: 1,
        borderColor: '#e5e5ea',
    },
    primaryButton: {
        backgroundColor: '#007AFF',
        paddingVertical: 16,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 8,
        elevation: 4,
        boxShadow: '0px 4px 8px rgba(0, 122, 255, 0.3)',
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: '#e5e5ea',
    },
    dividerText: {
        color: '#8e8e93',
        paddingHorizontal: 12,
        fontSize: 13,
        fontWeight: '500',
    },
    socialContainer: {
        flexDirection: 'column',
        gap: 12,
    },
    socialButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e5e5ea',
        backgroundColor: '#ffffff',
    },
    appleButton: {
        backgroundColor: '#000000',
        borderColor: '#000000',
    },
    socialButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#3a3a3c',
        marginLeft: 10,
    },
    appleButtonText: {
        color: '#ffffff',
    },
    switchContainer: {
        marginTop: 32,
        alignItems: 'center',
    },
    switchText: {
        fontSize: 14,
        color: '#6c6c70',
    },
    switchTextBold: {
        color: '#007AFF',
        fontWeight: '600',
    },
});