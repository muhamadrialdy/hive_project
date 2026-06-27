import React from 'react';

interface HdiLogoProps {
  size?: number;
  color?: string;
}

const HdiLogo: React.FC<HdiLogoProps> = ({ size = 32, color = 'white' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="HDI Globe"
  >
    <circle cx="20" cy="20" r="17" stroke={color} strokeWidth="2" />
    <ellipse cx="20" cy="7.5"  rx="6.5"  ry="2"   stroke={color} strokeWidth="1.7" />
    <ellipse cx="20" cy="13"   rx="13"   ry="3"    stroke={color} strokeWidth="1.7" />
    <ellipse cx="20" cy="20"   rx="17"   ry="4"    stroke={color} strokeWidth="1.7" />
    <ellipse cx="20" cy="27"   rx="13"   ry="3"    stroke={color} strokeWidth="1.7" />
    <ellipse cx="20" cy="32.5" rx="6.5"  ry="2"   stroke={color} strokeWidth="1.7" />
  </svg>
);

export default HdiLogo;
