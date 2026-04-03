"""
SimpleNOC - Self-Signed SSL Certificate Generator
Generates cert.pem and key.pem in data/ssl/ if they don't exist.
Called automatically on startup; can also be run manually.
"""
import os, datetime, ipaddress

def generate_self_signed_cert(cert_path, key_path, hostname="localhost"):
    """Generate a self-signed certificate using the cryptography library."""
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    # Generate RSA private key
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    # Build certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME,             "US"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME,   "Local"),
        x509.NameAttribute(NameOID.LOCALITY_NAME,            "SimpleNOC"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME,        "SimpleNOC"),
        x509.NameAttribute(NameOID.COMMON_NAME,              hostname),
    ])

    now = datetime.datetime.now(datetime.timezone.utc)

    # Build SAN — include both DNS name and 127.0.0.1 so browsers accept it
    san_entries = [
        x509.DNSName(hostname),
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
    ]

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=3650))   # 10 years
        .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    os.makedirs(os.path.dirname(cert_path), exist_ok=True)

    # Write private key (PEM)
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption()
        ))

    # Write certificate (PEM)
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print(f"[SSL] Certificate generated: {cert_path}")
    print(f"[SSL] Private key generated:  {key_path}")
    return cert_path, key_path


def ensure_ssl_cert(base_dir):
    """
    Ensure SSL cert + key exist in <base_dir>/data/ssl/.
    Generates them automatically if missing.
    Returns (cert_path, key_path).
    """
    ssl_dir   = os.path.join(base_dir, "data", "ssl")
    cert_path = os.path.join(ssl_dir, "cert.pem")
    key_path  = os.path.join(ssl_dir, "key.pem")

    if os.path.exists(cert_path) and os.path.exists(key_path):
        print(f"[SSL] Using existing certificate: {cert_path}")
        return cert_path, key_path

    print("[SSL] No certificate found — generating self-signed cert...")
    return generate_self_signed_cert(cert_path, key_path)


if __name__ == "__main__":
    import sys
    base = os.path.dirname(os.path.abspath(__file__))
    cert, key = ensure_ssl_cert(base)
    print(f"\nCertificate : {cert}")
    print(f"Private key : {key}")
    print("\nAdd a browser exception for this self-signed cert at:")
    print("  https://localhost:5443")
