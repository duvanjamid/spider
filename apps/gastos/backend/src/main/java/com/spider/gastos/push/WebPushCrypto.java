package com.spider.gastos.push;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Base64;

/**
 * Cifrado de Web Push (RFC 8291 «aes128gcm») y firma VAPID (RFC 8292),
 * implementado solo con el JDK (EC P-256, ECDH, HKDF-SHA256, AES-128-GCM,
 * ES256). Sin dependencias externas: nada de BouncyCastle ni netty, para
 * mantener el fat-jar ligero y el arranque predecible.
 */
public final class WebPushCrypto {

    private static final Base64.Encoder B64U = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64UD = Base64.getUrlDecoder();
    private static final SecureRandom RNG = new SecureRandom();
    private static final ECParameterSpec P256 = p256Params();

    private WebPushCrypto() {}

    /** Cuerpo cifrado listo para el POST (cabecera aes128gcm + ciphertext). */
    public static byte[] encrypt(byte[] plaintext, String uaPublicB64, String authB64) throws Exception {
        byte[] uaPublic = decode(uaPublicB64);         // punto sin comprimir (65 bytes)
        byte[] authSecret = decode(authB64);           // 16 bytes

        KeyPair as = generateKeyPair();
        byte[] asPublic = uncompressedPoint((java.security.interfaces.ECPublicKey) as.getPublic());
        byte[] ecdhSecret = ecdh(as.getPrivate(), uaPublic);

        // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0"||ua||as, 32)
        byte[] keyInfo = concat("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[]{0}, uaPublic, asPublic);
        byte[] ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);

        byte[] salt = new byte[16];
        RNG.nextBytes(salt);
        byte[] prk = hmac(salt, ikm);                  // HKDF-Extract(salt, ikm)
        byte[] cek = hkdfExpand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
        byte[] nonce = hkdfExpand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);

        // Un único registro: data || 0x02 (delimitador de último registro).
        byte[] record = concat(plaintext, new byte[]{2});
        Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
        gcm.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] ciphertext = gcm.doFinal(record);

        int rs = 4096;                                 // record size del bloque
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(salt);
        out.write(new byte[]{(byte) (rs >>> 24), (byte) (rs >>> 16), (byte) (rs >>> 8), (byte) rs});
        out.write(asPublic.length);                    // idlen = 65
        out.write(asPublic);
        out.write(ciphertext);
        return out.toByteArray();
    }

    /** Cabecera Authorization VAPID: {@code vapid t=<jwt>, k=<publicKey>}. */
    public static String vapidAuthorization(String endpoint, String vapidPublicB64,
                                            String vapidPrivateB64, String subject) throws Exception {
        String aud = origin(endpoint);
        long exp = System.currentTimeMillis() / 1000 + 12 * 3600;   // <24h por RFC 8292
        String header = B64U.encodeToString("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String payload = B64U.encodeToString((
                "{\"aud\":\"" + aud + "\",\"exp\":" + exp + ",\"sub\":\"" + subject + "\"}"
        ).getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + payload;

        PrivateKey key = privateKey(decode(vapidPrivateB64));
        Signature sig = Signature.getInstance("SHA256withECDSA");
        sig.initSign(key);
        sig.update(signingInput.getBytes(StandardCharsets.US_ASCII));
        byte[] jose = derToJose(sig.sign());           // r||s de 64 bytes
        String jwt = signingInput + "." + B64U.encodeToString(jose);
        return "vapid t=" + jwt + ", k=" + vapidPublicB64;
    }

    /** Origen (scheme://host[:port]) del endpoint, sin la ruta, para el «aud». */
    public static String origin(String endpoint) {
        java.net.URI u = java.net.URI.create(endpoint);
        String o = u.getScheme() + "://" + u.getHost();
        if (u.getPort() > 0) o += ":" + u.getPort();
        return o;
    }

    // ── Primitivas ──────────────────────────────────────────────

    private static byte[] ecdh(PrivateKey asPrivate, byte[] uaPublic) throws Exception {
        KeyFactory kf = KeyFactory.getInstance("EC");
        BigInteger x = new BigInteger(1, java.util.Arrays.copyOfRange(uaPublic, 1, 33));
        BigInteger y = new BigInteger(1, java.util.Arrays.copyOfRange(uaPublic, 33, 65));
        PublicKey ua = kf.generatePublic(new ECPublicKeySpec(new ECPoint(x, y), P256));
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(asPrivate);
        ka.doPhase(ua, true);
        return ka.generateSecret();
    }

    private static PrivateKey privateKey(byte[] s) throws Exception {
        return KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, s), P256));
    }

    private static KeyPair generateKeyPair() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"));
        return kpg.generateKeyPair();
    }

    private static byte[] uncompressedPoint(java.security.interfaces.ECPublicKey pub) {
        byte[] x = i2osp(pub.getW().getAffineX(), 32);
        byte[] y = i2osp(pub.getW().getAffineY(), 32);
        byte[] out = new byte[65];
        out[0] = 0x04;
        System.arraycopy(x, 0, out, 1, 32);
        System.arraycopy(y, 0, out, 33, 32);
        return out;
    }

    /** HKDF-SHA256 completo: Extract(salt, ikm) → Expand(info, len). */
    private static byte[] hkdf(byte[] salt, byte[] ikm, byte[] info, int len) throws Exception {
        return hkdfExpand(hmac(salt, ikm), info, len);
    }

    private static byte[] hkdfExpand(byte[] prk, byte[] info, int len) throws Exception {
        byte[] t = hmac(prk, concat(info, new byte[]{1}));   // len<=32 ⇒ un solo bloque
        return java.util.Arrays.copyOf(t, len);
    }

    private static byte[] hmac(byte[] key, byte[] data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    /** DER (SEQUENCE{INTEGER r, INTEGER s}) → JOSE (r||s, 32 bytes c/u). */
    private static byte[] derToJose(byte[] der) {
        int off = 3;                       // 0x30 len 0x02
        int rLen = der[off] & 0xff;
        off++;
        byte[] r = java.util.Arrays.copyOfRange(der, off, off + rLen);
        off += rLen + 1;                   // saltar r y el 0x02 de s
        int sLen = der[off] & 0xff;
        off++;
        byte[] s = java.util.Arrays.copyOfRange(der, off, off + sLen);
        byte[] out = new byte[64];
        System.arraycopy(i2osp(new BigInteger(1, r), 32), 0, out, 0, 32);
        System.arraycopy(i2osp(new BigInteger(1, s), 32), 0, out, 32, 32);
        return out;
    }

    private static byte[] i2osp(BigInteger v, int len) {
        byte[] b = v.toByteArray();
        if (b.length == len) return b;
        byte[] out = new byte[len];
        if (b.length == len + 1 && b[0] == 0) { System.arraycopy(b, 1, out, 0, len); return out; }
        if (b.length < len) { System.arraycopy(b, 0, out, len - b.length, b.length); return out; }
        System.arraycopy(b, b.length - len, out, 0, len);
        return out;
    }

    private static byte[] concat(byte[]... parts) {
        int n = 0;
        for (byte[] p : parts) n += p.length;
        byte[] out = new byte[n];
        int i = 0;
        for (byte[] p : parts) { System.arraycopy(p, 0, out, i, p.length); i += p.length; }
        return out;
    }

    private static byte[] decode(String b64url) {
        String s = b64url.trim().replace('+', '-').replace('/', '_');
        int pad = s.length() % 4;
        if (pad == 2) s += "";
        return B64UD.decode(s.replace("=", ""));
    }

    private static ECParameterSpec p256Params() {
        try {
            AlgorithmParameters p = AlgorithmParameters.getInstance("EC");
            p.init(new ECGenParameterSpec("secp256r1"));
            return p.getParameterSpec(ECParameterSpec.class);
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo inicializar la curva P-256", e);
        }
    }
}
