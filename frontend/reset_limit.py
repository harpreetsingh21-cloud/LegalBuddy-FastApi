import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["legalbuddy"]
    result = await db["users"].update_one(
        {"email": "harpreetsingh21@gmail.com"},
        {"$set": {"daily_doc_count": 0}}
    )
    print("Matched:", result.matched_count, "Modified:", result.modified_count)

asyncio.run(main())
