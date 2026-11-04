import os
import glob
import re
import urllib.parse
import sys

sys.stdout.reconfigure(encoding='utf-8')

def audit_assets():
    print("=================================================================")
    print("   E-COMMERCE FULL LOCAL ASSET, LINK & SECURITY AUDIT")
    print("=================================================================")
    
    html_files = glob.glob('*.html')
    print(f"Auditing {len(html_files)} HTML files: {html_files}")
    
    missing_assets = []
    broken_links = []
    suspicious_patterns = []
    
    for hf in html_files:
        with open(hf, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # 1. Check all <img src="...">
        img_srcs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', content, re.IGNORECASE)
        for src in img_srcs:
            if src.startswith(('data:', 'http://', 'https://', '#', 'javascript:')):
                continue
            clean = urllib.parse.unquote(src.split('?')[0].lstrip('/\\'))
            if not os.path.exists(clean):
                missing_assets.append((hf, 'img_src', src, clean))
                
        # 2. Check all <link rel="stylesheet" href="...">
        css_links = re.findall(r'<link[^>]+href=["\']([^"\']+)["\']', content, re.IGNORECASE)
        for link in css_links:
            if link.startswith(('data:', 'http://', 'https://', '#', 'javascript:')):
                continue
            clean = urllib.parse.unquote(link.split('?')[0].lstrip('/\\'))
            if not os.path.exists(clean):
                missing_assets.append((hf, 'stylesheet', link, clean))
                
        # 3. Check all <script src="...">
        script_srcs = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', content, re.IGNORECASE)
        for ssrc in script_srcs:
            if ssrc.startswith(('data:', 'http://', 'https://', '#', 'javascript:')):
                continue
            clean = urllib.parse.unquote(ssrc.split('?')[0].lstrip('/\\'))
            if not os.path.exists(clean):
                missing_assets.append((hf, 'script', ssrc, clean))
                
        # 4. Check for remote demo11 links or broken anchors
        demo11_refs = re.findall(r'demo11\.itservicelab\.com[^\s"\'<>]*', content)
        if demo11_refs:
            for d in set(demo11_refs):
                broken_links.append((hf, 'remote_demo11', d))
                
        # 5. Check for malformed HTML hrefs like index.htmlcategory/...
        malformed = re.findall(r'href=["\']([a-zA-Z0-9_\-\.]+\.html[a-zA-Z0-9_\-\/]+)["\']', content)
        if malformed:
            for m in set(malformed):
                broken_links.append((hf, 'malformed_href', m))
                
        # 6. Check for potential sensitive credential leaks (e.g. DB_PASSWORD, api_key, etc.)
        for pat in [r'(?:password|secret|token|api_key|access_token|private_key)\s*[:=]\s*["\'][^"\']+["\']']:
            matches = re.findall(pat, content, re.IGNORECASE)
            for m in matches:
                # filter common non-secret matches like type="password"
                if 'type=' not in m.lower():
                    suspicious_patterns.append((hf, 'credential_leak_candidate', m))

    print(f"\n1. Missing Asset Files (Images, CSS, JS): {len(missing_assets)}")
    for hf, kind, raw, clean in missing_assets:
        print(f"   [{hf}] ({kind}) {raw} -> NOT FOUND: {clean}")
        
    print(f"\n2. Broken / Remote Demo11 Links: {len(broken_links)}")
    for hf, kind, val in broken_links:
        print(f"   [{hf}] ({kind}) {val}")
        
    print(f"\n3. Sensitive Data / Credential Leaks: {len(suspicious_patterns)}")
    for hf, kind, val in suspicious_patterns:
        print(f"   [{hf}] ({kind}) {val}")

    return len(missing_assets) == 0 and len(broken_links) == 0

if __name__ == '__main__':
    audit_assets()
