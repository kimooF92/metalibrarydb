import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function testImageProxy() {
  const testUrl = "https://scontent.fpbc2-2.fna.fbcdn.net/v/t39.35426-6/753707713_2254612941964291_92313734500519260_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=RjmxAfGL_g4Q7kNvwHDuwDJ&_nc_oc=AdrD5H0Za0cLZZ_b-aBmPEQKbNRylg1Ik8WPM0rn1Kt63kVoR9NRcQyTFF5SZKZdbNw&_nc_zt=14&_nc_ht=scontent.fpbc2-2.fna&_nc_gid=JpKzuWjmxYGpUr0ypKbRVw&_nc_ss=7f289&oh=00_AQFvM-6f7Xq_Ea6cgOFwfhfoBbK1ncoue6gfhfRxY8Vzhw&oe=6A90E53C";

  console.log("Testing fetch with different headers...");

  // Try 1: Standard fetch
  try {
    const res1 = await fetch(testUrl);
    console.log("1. Direct fetch without headers -> status:", res1.status);
  } catch (e: any) {
    console.log("1. Direct fetch error:", e.message);
  }

  // Try 2: With Facebook referer & Chrome User-Agent
  try {
    const res2 = await fetch(testUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.facebook.com/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    console.log("2. Fetch with FB referer -> status:", res2.status);
  } catch (e: any) {
    console.log("2. FB referer fetch error:", e.message);
  }

  // Try 3: With Sec-Fetch headers
  try {
    const res3 = await fetch(testUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.facebook.com/ads/library/",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    console.log("3. Fetch with Sec-Fetch headers -> status:", res3.status);
  } catch (e: any) {
    console.log("3. Sec-Fetch error:", e.message);
  }

  process.exit(0);
}

testImageProxy();
