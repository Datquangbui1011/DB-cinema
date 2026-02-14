import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeroSection from '../HeroSection';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('HeroSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and fetches posters', async () => {
    const mockPosters = {
      success: true,
      posters: [
        { imageUrl: 'http://example.com/desktop1.jpg', deviceType: 'desktop' },
        { imageUrl: 'http://example.com/mobile1.jpg', deviceType: 'mobile' }
      ]
    };

    axios.get.mockResolvedValue({ data: mockPosters });

    render(<HeroSection />);

    // Verify API call
    expect(axios.get).toHaveBeenCalledWith("http://localhost:3000/api/admin/hero-posters");

    // Wait for images to be set
    await waitFor(() => {
      // Logic for desktop (default > 768)
      // We expect desktop image to be present/used
      // The component renders an img tag
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'http://example.com/desktop1.jpg');
    });
  });

  it('fetches and displays mobile images on small screens', async () => {
      // Mock window.innerWidth
      Object.defineProperty(window, 'innerWidth', {writable: true, configurable: true, value: 500});
      window.dispatchEvent(new Event('resize'));

      const mockPosters = {
        success: true,
        posters: [
          { imageUrl: 'http://example.com/desktop1.jpg', deviceType: 'desktop' },
          { imageUrl: 'http://example.com/mobile1.jpg', deviceType: 'mobile' }
        ]
      };
  
      axios.get.mockResolvedValue({ data: mockPosters });
  
      render(<HeroSection />);
  
      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', 'http://example.com/mobile1.jpg');
      });
  });
});
