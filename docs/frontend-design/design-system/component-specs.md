# Component Specs

Copy these styles exactly. All colors reference design-tokens.md.

## Buttons

### Primary (dark CTA)
```css
background: #37352F;
color: #FFFFFF;
font-size: 14px;
font-weight: 500;
padding: 8px 20px;
height: 40px;
border-radius: 8px;
border: none;
/* hover */
background: #55534E;
/* active */
transform: scale(0.98);
```

### Primary large (marketing CTA)
```css
/* same as primary but: */
font-size: 15px;
padding: 10px 24px;
height: 44px;
```

### Ghost / secondary
```css
background: transparent;
color: #37352F;
font-size: 14px;
font-weight: 500;
padding: 8px 16px;
height: 40px;
border-radius: 8px;
border: 1px solid rgba(55,53,47,0.16);
/* hover */
background: rgba(55,53,47,0.04);
border-color: rgba(55,53,47,0.24);
```

### Danger
```css
background: #E03E3E;
color: #FFFFFF;
font-size: 14px;
font-weight: 500;
padding: 8px 20px;
border-radius: 8px;
```

### Icon button
```css
width: 32px;
height: 32px;
border-radius: 8px;
background: transparent;
color: rgba(55,53,47,0.4);
display: flex;
align-items: center;
justify-content: center;
/* hover */
background: rgba(55,53,47,0.08);
color: #37352F;
```

### Pill button (filter, quick action)
```css
padding: 4px 12px;
height: 28px;
border-radius: 999px;
font-size: 12px;
font-weight: 500;
border: 1px solid rgba(55,53,47,0.16);
background: #FFFFFF;
color: rgba(55,53,47,0.6);
/* selected state */
background: #37352F;
color: #FFFFFF;
border-color: #37352F;
```

## Cards

### Default card
```css
background: #FFFFFF;
border: 1px solid rgba(55,53,47,0.09);
border-radius: 12px;
padding: 16px 20px;
/* NO shadow at rest */
/* hover */
border-color: rgba(55,53,47,0.24);
box-shadow: 0 2px 8px rgba(55,53,47,0.06);
```

### Surface card (no border, tinted bg)
```css
background: #F7F6F3;
border: none;
border-radius: 8px;
padding: 16px;
```

### Metric card
```css
background: #F7F6F3;
border: none;
border-radius: 8px;
padding: 16px;
/* number */ font-size: 28px; font-weight: 600; color: #37352F;
/* label */ font-size: 12px; font-weight: 400; color: rgba(55,53,47,0.6);
```

## Inputs

### Text input
```css
height: 40px;
padding: 0 12px;
font-size: 14px;
color: #37352F;
border: 1px solid rgba(55,53,47,0.16);
border-radius: 8px;
background: #FFFFFF;
/* placeholder */ color: rgba(55,53,47,0.4);
/* focus */
border-color: #2383E2;
box-shadow: 0 0 0 2px rgba(35,131,226,0.28);
/* with left icon: */ padding-left: 36px;
```

### Large input (auth pages)
```css
height: 44px;
padding: 0 14px;
font-size: 15px;
border-radius: 8px;
/* with left icon: */ padding-left: 40px;
```

### Search input (compact)
```css
height: 32px;
padding: 0 10px 0 32px;
font-size: 13px;
border-radius: 8px;
background: #F7F6F3;
border: 1px solid transparent;
/* focus */
background: #FFFFFF;
border-color: rgba(55,53,47,0.16);
```

### Textarea
```css
padding: 12px 16px;
font-size: 15px;
line-height: 1.6;
color: #37352F;
border: 1px solid rgba(55,53,47,0.16);
border-radius: 12px;
background: #FFFFFF;
resize: vertical;
min-height: 120px;
```

## Tags / Badges

### Semantic tag (colored)
```css
display: inline-flex;
align-items: center;
padding: 2px 8px;
border-radius: 4px;
font-size: 12px;
font-weight: 500;
/* use bg+text pairs from design-tokens semantic table */
/* example green: */ background: #DDEDEA; color: #0F7B6C;
```

### Pill badge
```css
/* same as semantic tag but: */
border-radius: 999px;
padding: 2px 10px;
```

### Status dot + label
```css
/* dot */ width: 6px; height: 6px; border-radius: 50%;
/* label */ font-size: 12px; font-weight: 500; margin-left: 6px;
```

## Table / List rows

### Table header
```css
height: 32px;
background: #F7F6F3;
font-size: 12px;
font-weight: 500;
color: rgba(55,53,47,0.6);
padding: 0 16px;
border-radius: 8px 8px 0 0;
```

### Table row
```css
height: 48px;
padding: 0 16px;
border-bottom: 1px solid rgba(55,53,47,0.06);
font-size: 14px;
color: #37352F;
/* hover */
background: rgba(55,53,47,0.04);
```

## Dividers
```css
border: none;
border-top: 1px solid rgba(55,53,47,0.09);
margin: 8px 0;
```

## Avatars
```css
width: 24px; /* 20=small, 24=default, 32=large, 64=profile */
height: 24px;
border-radius: 50%;
background: #E3E2E0;
font-size: 11px;
font-weight: 500;
color: #37352F;
display: flex;
align-items: center;
justify-content: center;
```

## Tooltips
```css
background: #37352F;
color: #FFFFFF;
font-size: 12px;
padding: 4px 8px;
border-radius: 4px;
box-shadow: 0 2px 6px rgba(55,53,47,0.2);
```

## Message banners (auth feedback)
```css
border-radius: 8px;
padding: 12px 16px;
font-size: 14px;
/* success */ background: #DDEDEA; color: #0F7B6C;
/* error */   background: #FBE4E4; color: #E03E3E;
/* info */    background: #DDEBF1; color: #0B6E99;
/* warning */ background: #FBF3DB; color: #DFAB01;
```

## Skeleton loading
```css
background: #F7F6F3;
border-radius: 4px;
animation: pulse 1.5s ease-in-out infinite;
/* title line */ height: 24px; width: 60%;
/* body line */  height: 14px; width: 100%/90%/80%; margin-top: 8px;
```

## Transitions
```css
/* default for all interactive elements */
transition: all 150ms ease;
/* menus open/close */
transition: opacity 200ms ease-out, transform 200ms ease-out;
/* transform from */ opacity: 0; transform: scale(0.95);
/* transform to */   opacity: 1; transform: scale(1);
```
