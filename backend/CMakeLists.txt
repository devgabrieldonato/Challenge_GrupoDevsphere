cmake_minimum_required(VERSION 3.20)
project(devsphere_api VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 99)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(SQLite3 REQUIRED)
find_package(Threads REQUIRED)

add_library(argon2 STATIC
  vendor/argon2/src/argon2.c
  vendor/argon2/src/core.c
  vendor/argon2/src/encoding.c
  vendor/argon2/src/thread.c
  vendor/argon2/src/ref.c
  vendor/argon2/src/blake2/blake2b.c
)
target_include_directories(argon2 PUBLIC vendor/argon2/include PRIVATE vendor/argon2/src)
target_link_libraries(argon2 PRIVATE Threads::Threads)

add_library(devsphere_core src/database.cpp src/security.cpp)
target_include_directories(devsphere_core PUBLIC include)
target_link_libraries(devsphere_core PUBLIC SQLite3::SQLite3 argon2)

if(APPLE)
  target_link_libraries(devsphere_core PUBLIC "-framework Security")
  target_compile_definitions(devsphere_core PUBLIC DEVSPHERE_APPLE_CRYPTO=1)
else()
  find_package(OpenSSL REQUIRED)
  target_link_libraries(devsphere_core PUBLIC OpenSSL::Crypto)
endif()

add_executable(devsphere-api src/main.cpp src/http_server.cpp)
target_link_libraries(devsphere-api PRIVATE devsphere_core)
target_compile_options(devsphere-api PRIVATE -Wall -Wextra -Wpedantic)

include(CTest)
if(BUILD_TESTING)
  add_executable(devsphere-tests tests/test_core.cpp)
  target_link_libraries(devsphere-tests PRIVATE devsphere_core)
  add_test(NAME core COMMAND devsphere-tests)
  set_tests_properties(core PROPERTIES WORKING_DIRECTORY ${CMAKE_SOURCE_DIR})
endif()
