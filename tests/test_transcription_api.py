import os
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

INSTABOX_URL = os.getenv("INSTABOX_TRANSCRIPTION_URL", "https://8000-agq4bjjbiypy3he5xczmt6fwuu.instabox.tech")
AUTH_TOKEN = os.getenv("INSTABOX_TRANSCRIPTION_KEY")

if not AUTH_TOKEN and os.path.exists(".env.local"):
    with open(".env.local", "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("INSTABOX_TRANSCRIPTION_KEY="):
                AUTH_TOKEN = line.strip().split("=", 1)[1].strip('"').strip("'")
            elif line.startswith("INSTABOX_TRANSCRIPTION_URL=") and not os.getenv("INSTABOX_TRANSCRIPTION_URL"):
                INSTABOX_URL = line.strip().split("=", 1)[1].strip('"').strip("'")

AUTH_TOKEN = AUTH_TOKEN or ""
BASE_URL = os.getenv("TARGET_URL", "http://localhost:3000")

def get_session():
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[502, 503, 504],
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    session.mount("http://", HTTPAdapter(max_retries=retries))
    return session

def test_instabox_health(session=None):
    """Verify that InstaBox microVM is reachable, healthy, and has Whisper models loaded."""
    s = session or get_session()
    res = s.get(f"{INSTABOX_URL}/health", timeout=15)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["status"] == "healthy", f"Expected healthy status, got {data}"
    assert "turbo" in data["models_available"], "large-v3-turbo model must be available"
    print("✓ test_instabox_health passed")

def test_instabox_auth_guard(session=None):
    """Verify that unauthorized requests without token are rejected with 401."""
    s = session or get_session()
    res = s.post(
        f"{INSTABOX_URL}/v1/transcribe",
        headers={"Content-Type": "application/json", "X-Auth-Token": "invalid_token_123"},
        json={"signed_media_url": "https://video.faep7-1.fna.fbcdn.net/test.mp4", "media_hash": "test123"},
        timeout=25,
    )
    assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
    print("✓ test_instabox_auth_guard passed")

def test_instabox_ssrf_guard(session=None):
    """Verify that non-allowlisted domains are rejected with 400 Bad Request."""
    s = session or get_session()
    res = s.post(
        f"{INSTABOX_URL}/v1/transcribe",
        headers={"Content-Type": "application/json", "X-Auth-Token": AUTH_TOKEN},
        json={"signed_media_url": "https://malicious-domain.com/video.mp4", "media_hash": "test123"},
        timeout=25,
    )
    assert res.status_code == 400, f"Expected 400 Bad Request for unapproved host, got {res.status_code}"
    assert "not allowlisted" in res.text, f"Expected allowlist error message, got: {res.text}"
    print("✓ test_instabox_ssrf_guard passed")

sess = get_session()
test_instabox_health(sess)
test_instabox_auth_guard(sess)
test_instabox_ssrf_guard(sess)
print("All backend assertion tests passed successfully!")
