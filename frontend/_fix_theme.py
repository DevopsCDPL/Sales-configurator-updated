import re

with open('src/theme.ts', 'r') as f:
    content = f.read()

# Remove ...(isDark && { ... }) spreads
content = re.sub(r'\.\.\.\(isDark && \{[^}]+\}\),?\s*', '', content)

# isDark ? 'string_val' : 'string_val'  =>  light value
def replace_ternary_strings(m):
    return m.group(1)

content = re.sub(r"isDark \? '[^']+' : ('[^']+')", replace_ternary_strings, content)

# isDark ? PRIMARY_LT : PRIMARY  => PRIMARY
content = content.replace('isDark ? PRIMARY_LT : PRIMARY', 'PRIMARY')
content = content.replace('isDark ? PRIMARY_LT : c.textPrimary', 'c.textPrimary')
content = content.replace('isDark ? c.bgSurface2 : c.textPrimary', 'c.textPrimary')
content = content.replace('isDark ? c.textMuted : c.textMuted', 'c.textMuted')

# isDark ? number : number  =>  light number
content = re.sub(r'isDark \? [\d.]+ : ([\d.]+)', r'\1', content)

# Handle backtick template: isDark ? `...` : SHADOW_SM or 'none'
content = re.sub(r"isDark \? `[^`]+` : (SHADOW_\w+)", r'\1', content)
content = re.sub(r"isDark \? `[^`]+` : ('none')", r'\1', content)
content = re.sub(r"isDark \? `[^`]+` : ('[^']+')", r'\1', content)

# alpha(X, isDark ? 0.1 : 0.04) => alpha(X, 0.04)
content = re.sub(r'isDark \? [\d.]+ : ([\d.]+)', r'\1', content)

with open('src/theme.ts', 'w') as f:
    f.write(content)

print('Done. Remaining isDark count:', content.count('isDark'))
