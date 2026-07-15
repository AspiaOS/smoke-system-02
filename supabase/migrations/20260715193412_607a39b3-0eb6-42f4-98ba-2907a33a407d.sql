CREATE OR REPLACE VIEW public.public_catalog AS
SELECT p.id AS product_id, p.name AS product_name, p.brand, p.description, p.images, p.video_url, p.featured, p.category_id, c.name AS category_name, v.id AS variation_id, v.name AS variation_name, v.price, (v.stock > 0) AS in_stock
FROM products p
JOIN variations v ON v.product_id = p.id
JOIN categories c ON c.id = p.category_id
WHERE p.active AND p.visible AND c.active AND v.active;