'use client';

import React from 'react';
import Link from 'next/link';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import { 
  Building, 
  Wrench, 
  Shield, 
  Users, 
  BarChart3, 
  CheckCircle,
  ArrowRight,
  Play,
  Star,
  Zap
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';

export default function LandingPage() {
  const { isAuthenticated, user } = useSessionGuard({ 
    requireAuth: false, 
    showToast: false 
  });

  const features = [
    {
      icon: <Building className="w-8 h-8 text-blue-600" />,
      title: "Property Management",
      description: "Efficiently manage multiple properties and facilities from a single dashboard."
    },
    {
      icon: <Wrench className="w-8 h-8 text-green-600" />,
      title: "Preventive Maintenance",
      description: "Schedule and track maintenance tasks to prevent costly breakdowns."
    },
    {
      icon: <Shield className="w-8 h-8 text-purple-600" />,
      title: "Security & Compliance",
      description: "Ensure your facilities meet all safety and regulatory requirements."
    },
    {
      icon: <Users className="w-8 h-8 text-orange-600" />,
      title: "Team Collaboration",
      description: "Coordinate maintenance teams and track work progress in real-time."
    },
    {
      icon: <BarChart3 className="w-8 h-8 text-red-600" />,
      title: "Analytics & Reporting",
      description: "Get insights into maintenance performance and cost optimization."
    },
    {
      icon: <CheckCircle className="w-8 h-8 text-emerald-600" />,
      title: "Quality Assurance",
      description: "Maintain high standards with automated quality checks and approvals."
    }
  ];

  const benefits = [
    "Reduce maintenance costs by up to 30%",
    "Increase equipment lifespan by 40%",
    "Improve team productivity by 50%",
    "Ensure 99.9% compliance rate",
    "Real-time monitoring and alerts",
    "Mobile-first responsive design"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Building className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">HotelEngPro</span>
            </div>
            
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-gray-600">
                    Welcome back, {user?.username}!
                  </span>
                  <Button asChild>
                    <Link href="/dashboard">
                      Go to Dashboard
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" asChild>
                    <Link href="/auth/login">Sign In</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/auth/register">Get Started</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-8">
            <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 text-sm font-medium rounded-full mb-6">
              <Zap className="w-4 h-4 mr-2" />
              New: AI-Powered Maintenance Predictions
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              Streamline Your
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                {" "}Hotel Engineering{" "}
              </span>
              Operations
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              The complete hotel engineering and maintenance management solution that helps you maintain properties, 
              coordinate teams, and optimize costs with intelligent automation.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isAuthenticated ? (
              <Button size="lg" asChild>
                <Link href="/dashboard">
                  Continue to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link href="/auth/register">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="#demo">
                    <Play className="w-4 h-4 mr-2" />
                    Watch Demo
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need for Hotel Engineering Management
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From preventive maintenance to team coordination, HotelEngPro has you covered 
              with powerful tools and intuitive interfaces.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow duration-300">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 p-3 bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-gray-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Transform Your Hotel Engineering Operations
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Join thousands of hotel engineers who have revolutionized their 
                maintenance processes with HotelEngPro.
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-8 text-white">
                <div className="text-center">
                  <Star className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">Trusted by Hotel Industry Leaders</h3>
                  <p className="text-blue-100 mb-6">
                    Join hotels that trust HotelEngPro with their engineering management
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold">500+</div>
                      <div className="text-blue-100">Hotels</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">10K+</div>
                      <div className="text-blue-100">Engineers</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Join thousands of hotel engineers who have already transformed 
            their maintenance operations with HotelEngPro.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isAuthenticated ? (
              <Button size="lg" variant="secondary" asChild>
                <Link href="/dashboard">
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" variant="secondary" asChild>
                  <Link href="/auth/register">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/auth/login">Sign In</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Building className="w-6 h-6 text-blue-500" />
                <span className="text-lg font-bold text-white">HotelEngPro</span>
              </div>
              <p className="text-sm">
                The complete hotel engineering and maintenance solution for modern hotels.
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="#features" className="hover:text-white">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link href="#demo" className="hover:text-white">Demo</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/about" className="hover:text-white">About</Link></li>
                <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
                <li><Link href="/careers" className="hover:text-white">Careers</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/help" className="hover:text-white">Help Center</Link></li>
                <li><Link href="/docs" className="hover:text-white">Documentation</Link></li>
                <li><Link href="/status" className="hover:text-white">System Status</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
            <p>&copy; 2024 HotelEngPro. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}