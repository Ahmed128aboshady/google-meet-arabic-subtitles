import os
from PIL import Image, ImageDraw, ImageFont

icons_dir = r"C:\Users\Video Editor\.gemini\antigravity\scratch\google-meet-arabic-subtitles\icons"
os.makedirs(icons_dir, exist_ok=True)

def create_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw rounded gradient box
    margin = int(size * 0.05)
    box = [margin, margin, size - margin, size - margin]
    radius = int(size * 0.2)

    # Simple background fill
    draw.rounded_rectangle(box, radius=radius, fill=(99, 102, 241, 255), outline=(129, 140, 248, 255), width=max(1, size // 32))

    # Draw inner translation symbol (speech bubble / text)
    cx, cy = size // 2, size // 2
    r = int(size * 0.25)
    
    # Inner circle or bubble
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 230))
    
    # Save icon
    img.save(os.path.join(icons_dir, f"icon{size}.png"))
    print(f"Generated icon{size}.png")

for s in [16, 48, 128]:
    create_icon(s)

print("Icons generated successfully!")
