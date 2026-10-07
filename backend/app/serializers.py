from .models import Listing


def listing_to_dict(listing: Listing, *, redact_private_contact: bool = True) -> dict:
    return {
        "id": listing.id,
        "owner_id": listing.owner_id,
        "status": listing.status,
        "title": listing.title,
        "description": listing.description,
        "property_type": listing.property_type,
        "district": listing.district,
        "address": listing.address,
        "latitude": listing.latitude,
        "longitude": listing.longitude,
        "monthly_rent": listing.monthly_rent,
        "rent_currency": listing.rent_currency,
        "monthly_rent_azn": listing.monthly_rent_azn,
        "deposit": listing.deposit,
        "area_sqm": listing.area_sqm,
        "rooms": listing.rooms,
        "bedrooms": listing.bedrooms,
        "bathrooms": listing.bathrooms,
        "max_guests": listing.max_guests,
        "furnished": listing.furnished,
        "floor": listing.floor,
        "total_floors": listing.total_floors,
        "has_elevator": listing.has_elevator,
        "has_balcony": listing.has_balcony,
        "has_parking": listing.has_parking,
        "has_air_conditioning": listing.has_air_conditioning,
        "has_heating": listing.has_heating,
        "pets_allowed": listing.pets_allowed,
        "smoking_allowed": listing.smoking_allowed,
        "utilities_included": listing.utilities_included,
        "minimum_lease_months": listing.minimum_lease_months,
        "discount_tiers": [
            {
                "min_months": tier.min_months,
                "discount_percent": tier.discount_percent,
            }
            for tier in listing.discount_tiers
        ],
        "available_from": listing.available_from,
        "nearby_places": listing.nearby_places,
        "nearby_updated_at": listing.nearby_updated_at,
        "contact_name": listing.contact_name,
        "contact_phone": (
            None
            if redact_private_contact and listing.contact_method.value == "messages"
            else listing.contact_phone
        ),
        "contact_method": listing.contact_method,
        "show_contact_name": listing.show_contact_name,
        "contact_telegram": (
            None
            if redact_private_contact and listing.contact_method.value == "messages"
            else listing.contact_telegram
        ),
        "contact_whatsapp": (
            None
            if redact_private_contact and listing.contact_method.value == "messages"
            else listing.contact_whatsapp
        ),
        "created_at": listing.created_at,
        "updated_at": listing.updated_at,
        "published_at": listing.published_at,
        "media": [
            {
                "id": media.id,
                "media_type": media.media_type,
                "url": f"/api/v1/media/{media.id}",
                "content_type": media.content_type,
                "size_bytes": media.size_bytes,
                "original_name": media.original_name,
                "caption": media.caption,
                "sort_order": media.sort_order,
                "is_cover": media.is_cover,
            }
            for media in listing.media
        ],
    }
