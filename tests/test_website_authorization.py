import unittest
from ai_service.website_authorization import WebsiteConsent, consent_page
from runtime.ubuntu_runtime import normalize_origin


class WebsiteAuthorizationTests(unittest.TestCase):
    def test_confirmation_is_bound_to_the_exact_website(self):
        portal = WebsiteConsent(normalize_origin)
        origin, token = portal.issue('https://example.com:443')
        self.assertEqual(origin, 'https://example.com')
        self.assertEqual(portal.consume(token, origin), origin)

    def test_confirmation_is_single_use(self):
        portal=WebsiteConsent(normalize_origin)
        origin,token=portal.issue('https://example.com')
        portal.consume(token,origin)
        with self.assertRaises(ValueError):portal.consume(token,origin)

    def test_token_cannot_authorize_another_website(self):
        portal=WebsiteConsent(normalize_origin)
        _,token=portal.issue('https://example.com')
        with self.assertRaises(ValueError):portal.consume(token,'https://other.example.com')

    def test_expired_token_cannot_authorize_any_site(self):
        now=[0];portal=WebsiteConsent(normalize_origin,clock=lambda:now[0])
        origin,token=portal.issue('https://example.com');now[0]=301
        with self.assertRaises(ValueError):portal.consume(token,origin)

    def test_unsafe_origins_are_not_accepted(self):
        portal=WebsiteConsent(normalize_origin)
        for origin in ['http://example.com', 'https://user:password@example.com', 'file:///tmp/page']:
            with self.assertRaises(ValueError):portal.issue(origin)

    def test_confirmation_html_escapes_domain_and_token_values(self):
        body=consent_page('https://example.com"><script>bad</script>', '"><script>bad</script>').decode()
        self.assertNotIn('<script>', body)
        self.assertIn('&lt;script&gt;', body)
