from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """
    Login endpoint that returns a token for authenticated users.

    Request body:
        {
            "username": "string",
            "password": "string"
        }

    Response:
        {
            "token": "string",
            "user": {
                "id": int,
                "username": "string",
                "email": "string"
            }
        }
    """
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'detail': 'Please provide both username and password'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = authenticate(username=username, password=password)

    if not user:
        return Response(
            {'detail': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    # Get or create token for the user
    token, created = Token.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
        }
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """
    Logout endpoint that deletes the user's token.

    Requires authentication token in header:
        Authorization: Token <token>

    Response:
        {
            "detail": "Successfully logged out"
        }
    """
    # Delete the user's token
    try:
        request.user.auth_token.delete()
    except Exception:
        pass

    return Response(
        {'detail': 'Successfully logged out'},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_profile(request):
    """
    Get the current authenticated user's profile.

    Requires authentication token in header:
        Authorization: Token <token>

    Response:
        {
            "id": int,
            "username": "string",
            "email": "string",
            "first_name": "string",
            "last_name": "string"
        }
    """
    user = request.user

    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
    })
